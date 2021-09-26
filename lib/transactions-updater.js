const logger = require('console-files')
const { getStores, authentications, transactions } = require('./database')
const wirecardStatus = require('./parse-payment-status')

const handler = appSdk => {
  logger.log('Transactions updater init..')
  const job = () => getStores().then(listOfStores => {
    let current = 0
    const nextStore = () => {
      current++
      return checkStores()
    }

    const checkStores = () => {
      if (!listOfStores[current]) {
        return Promise.resolve()
      }
      const storeId = listOfStores[current]
      return authentications.get(storeId).then(auth => {
        const date = new Date()
        date.setDate(date.getDate() - 7)
        const url = 'orders.json?fields=_id,transactions,payments_history,financial_status,number' +
          '&transactions.app.intermediator.code=wirecard' +
          `&created_at>=${date.toISOString()}` +
          '&sort=financial_status.updated_at' +
          '&limit=20'

        return appSdk
          .apiRequest(storeId, url)
          .then(({ response }) => {
            const { result } = response.data
            let index = 0
            const nextOrder = () => {
              index++
              return checkOrder()
            }

            const checkOrder = async () => {
              if (!result[index]) {
                return nextStore()
              }

              const order = result[index]
              if (order && order.financial_status && order.financial_status.current && order.transactions) {
                const orderTransaction = order.transactions.find(transaction => transaction.intermediator && transaction.intermediator.transaction_code)

                if (orderTransaction) {
                  // busca a transação no wirecard
                  const ecomStatus = order.financial_status.current
                  transactions.get(orderTransaction.intermediator.transaction_code)
                    .then(data => {
                      if (wirecardStatus(data.current_status) !== ecomStatus) {
                        const paymentsHistory = {
                          transaction_id: orderTransaction._id,
                          date_time: new Date().toISOString(),
                          status: wirecardStatus(data.current_status),
                          flags: [
                            'wirecard',
                            'transactions:updater'
                          ]
                        }
                        const url = `orders/${order._id}/payments_history.json`
                        const method = 'POST'
                        return appSdk.apiRequest(storeId, url, method, paymentsHistory).then(() => {
                          logger.log('@INFO:', JSON.stringify({
                            event: 'transactions:update',
                            order_number: order.number,
                            status: {
                              old: ecomStatus,
                              current: wirecardStatus(data.current_status)
                            },
                            storeId,
                            success: true
                          }, undefined, 2))
                        })
                      }
                    })
                    .catch(error => {
                      logger.log('@ERROR:', JSON.stringify({
                        event: 'transactions:update',
                        order_number: order.number,
                        storeId,
                        success: false,
                        error: true,
                        errors: error
                      }, undefined, 2))
                    })
                    .finally(nextOrder)
                } else {
                  nextOrder()
                }
              } else {
                nextOrder()
              }
            }

            checkOrder()
          })
      })
    }

    return checkStores()
  })

  const run = () => job().finally(() => {
    // call again after 12 hours
    console.log('CU')
    setTimeout(run, 60 * 60 * 1000)
  })

  run()
}

module.exports = handler