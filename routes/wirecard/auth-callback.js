'use strict'
const rq = require('request')
const qs = require('querystring')
const logger = require('console-files')
//
const { addWirecardAuth } = require('./../../lib/Api/Api')
//
module.exports = (appSdk) => {
  return (req, res) => {
    const { code, storeId } = req.query
    let appEnv = (process.env.WC_SANDBOX) ? 'https://connect-sandbox.' : 'https://connect.'
    let wirecardUri = appEnv + 'moip.com.br/oauth/token'

    let reqOptions = {
      url: wirecardUri,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': process.env.WC_ACCESS_TOKEN
      },
      form: qs.stringify({
        client_id: process.env.WC_ID,
        client_secret: process.env.WC_APP_SECRET,
        redirect_uri: process.env.WC_REDIRECT_URI,
        grant_type: 'authorization_code',
        code: code
      })
    }

    rq.post(reqOptions, (erro, resp, body) => {
      if (erro || resp.statusCode >= 400) {
        throw resp.body
      }

      let wirecardBody = JSON.parse(body)
      let accessToken = wirecardBody.access_token
      let refreshToken = wirecardBody.refresh_token
      let expiresIn = wirecardBody.expires_in
      let scope = wirecardBody.scope
      let accountId = wirecardBody.moipAccount.id

      addWirecardAuth(storeId, accessToken, refreshToken, expiresIn, scope, accountId)
        .then(() => {
          res.status(200)
          res.write('<script>window.close()</script>')
          return res.end()
        })

        .catch(error => {
          logger.error('WIRECARD_AUTH_ERR', error)
          res.status(400)
          return res.send({
            error: 'WIRECARD_AUTH_ERR',
            message: 'Unexpected Error Try Later'
          })
        })
    })
  }
}