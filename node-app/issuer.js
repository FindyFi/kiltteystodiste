// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// Verifiable Credentials Issuer Sample

///////////////////////////////////////////////////////////////////////////////////////
// Node packages
var express = require('express')
const https = require('node:https')
const url = require('node:url')
const sqlite3 = require('sqlite3').verbose();
var mainApp = require('./app.js');

// init DB
let db = new sqlite3.Database(mainApp.config.dbFile, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log(`Connected to the database ${mainApp.config.dbFile}.`);
  const create = "CREATE TABLE IF NOT EXISTS seq (num PRIMARY KEY)";
  db.run(create);
});

///////////////////////////////////////////////////////////////////////////////////////
// Setup the issuance request payload template
var issuanceConfig = {
  "authority": "...set at runtime...",
  "includeQRCode": false,
  "registration": {
      "clientName": "...set at runtime...",
      "purpose": "...set at runtime.."
  },
  "callback": {
    "url": "...set at runtime...",
    "state": "...set at runtime...",
    "headers": {
       "api-key": "...set at runtime..."
    }
  },
  "type": "Kiltteystodiste",
  "manifest": "...set at runtime..."
};

if ( mainApp.config["clientName"] ) {
  issuanceConfig.registration.clientName = mainApp.config["clientName"];
}
if ( issuanceConfig.registration.clientName.startsWith("...") ) {
  issuanceConfig.registration.clientName = "Kiltteystodiste";
}
if ( mainApp.config["purpose"] ) {
  issuanceConfig.registration.purpose = mainApp.config["purpose"];
}
if ( issuanceConfig.registration.purpose.startsWith("...") ) {
  issuanceConfig.registration.purpose = "Todista olleesi kiltti";
}
issuanceConfig.authority = mainApp.config["DidAuthority"]
issuanceConfig.manifest = mainApp.config["CredentialManifest"]

// if there is pin code in the config, but length is zero - remove it. It really shouldn't be there
if ( mainApp.config["issuancePinCodeLength"] && mainApp.config["issuancePinCodeLength"] > 0 ) {
  issuanceConfig.pin = { length: mainApp.config["issuancePinCodeLength"], value: '' };
}
if ( issuanceConfig.pin && issuanceConfig.pin.length == 0 ) {
  issuanceConfig.pin = null;
}
if ( issuanceConfig.callback.headers ) {
  issuanceConfig.callback.headers['api-key'] = mainApp.config["apiKey"];
}
//console.log( issuanceConfig );

///////////////////////////////////////////////////////////////////////////////////////
//
function generatePin( digits ) {
  var add = 1, max = 12 - add;
  max        = Math.pow(10, digits+add);
  var min    = max/10; // Math.pow(10, n) basically
  var number = Math.floor( Math.random() * (max - min + 1) ) + min;
  return ("" + number).substring(add); 
}

async function db_get(query) {
  return new Promise(function(resolve,reject){
    db.get(query, function(err,row){
       if(err){return reject(err);}
       resolve(row);
     });
  });
}

///////////////////////////////////////////////////////////////////////////////////////
// This method is called from the UI to initiate the issuance of the  credential
mainApp.app.get('/api/issuer/issuance-request', async (req, res) => {
  var id = req.session.id;
  if ( req.query.id ) {
    id = req.query.id;
  }

  // get the Access Token
  var accessToken = "";
  try {
    const result = await mainApp.msalCca.acquireTokenByClientCredential(mainApp.msalClientCredentialRequest);
    if ( result ) {
      accessToken = result.accessToken;
    }
  } catch {
    console.log( "failed to get access token" );
    res.status(401).json({
        'error': 'Could not acquire credentials to access Verified ID'
        });  
      return; 
  }
  console.log( `accessToken: ${accessToken}` );
  
  issuanceConfig.authority = mainApp.config["DidAuthority"]

  issuanceConfig.callback.url = `https://${req.hostname}/api/request-callback`;
  issuanceConfig.callback.state = id;
  // if pin is required, then generate a pin code. 
  // pincode can only be used for idTokenHint attestation
  if ( issuanceConfig.pin ) {
    // don't use pin if user is on mobile device as it doesn't make sense
    if ( req.headers["user-agent"].includes("Android") || req.headers["user-agent"].includes('iPhone')) {
      delete issuanceConfig.pin;
    } else {
      issuanceConfig.pin.value = generatePin( issuanceConfig.pin.length );
    }
  }
  // copy claim names from manifest for idTokenHint - this is a bit extra and you can just set the claims below
  console.log('claims config:')
  console.log(mainApp.config["claims"])
  if ( mainApp.config["claims"] ) {
    issuanceConfig.claims = {};
    for (i = 0; i < mainApp.config["claims"].length; i++) {
      var claimName = mainApp.config["claims"][i].claim.replace("$.", "");
      issuanceConfig.claims[claimName] = "...set in code...";
    }
  } 

  // set the claim values - only for idTokenHint attestation
  if ( issuanceConfig.claims ) {
    if ( issuanceConfig.claims.numero ) {
      const query = "SELECT MAX(num) AS seq FROM seq;"
      let next = 1
      const row = await db_get(query)
      if (row) {
        next = row.seq + 1
      }
      const insert = `INSERT INTO seq (num) VALUES (${next})`;
      db.run(insert);
      issuanceConfig.claims.numero = next.toString();
      issuanceConfig.claims.nimi = req.query.nimi;
    }
  }
  console.log( issuanceConfig );

  // call Verified ID Request Service issuance API
  console.log( 'Request Service API Request' );
  var client_api_request_endpoint = `${mainApp.config.msIdentityHostName}verifiableCredentials/createIssuanceRequest`;
  console.log( client_api_request_endpoint );

  var payload = JSON.stringify(issuanceConfig);
  const fetchOptions = {
    method: 'POST',
    body: payload,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length.toString(),
      'Authorization': `Bearer ${accessToken}`
    }
  };

  console.time("createIssuanceRequest");
  const response = await fetch(client_api_request_endpoint, fetchOptions);
  var resp = await response.json()
  console.timeEnd("createIssuanceRequest");
  // the response from the VC Request API call is returned to the caller (the UI). It contains the URI to the request which Authenticator can download after
  // it has scanned the QR code. If the payload requested the VC Request service to create the QR code that is returned as well
  // the javascript in the UI will use that QR code to display it on the screen to the user.            
  resp.id = id;                              // add session id so browser can pull status
  if ( issuanceConfig.pin ) {
    resp.pin = issuanceConfig.pin.value;   // add pin code so browser can display it
  }
  console.log( 'VC Client API Response' );
  console.log( response.status );
  console.log( resp );  

  if ( response.status > 299 ) {
    resp.error_description = `[${resp.error.innererror.code}] ${resp.error.message} ${resp.error.innererror.message}`;
    res.status(400).json( resp );  
  } else {
    res.status(200).json( resp );       
  }
})

///////////////////////////////////////////////////////////////////////////////////////
// Returns the manifest to the UI so it can use it in rendering
mainApp.app.get('/api/issuer/get-manifest', async (req, res) => {
  var id = req.query.id;
  res.status(200).json(mainApp.config["manifest"]);   
})
