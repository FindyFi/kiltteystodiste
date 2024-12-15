#!/bin/bash

docker run --rm -it -p 8080:8080 \
 -e azTenantId='<tenantId>' \
 -e azClientId='<appId>' \
 -e azClientSecret='<secret>' \
 -e DidAuthority='did:web:verifiedid.entra.microsoft.com:39662e39-3e1d-455b-9013-c493ab830fd3:0afc3875-fe0b-7b3e-98fa-fa24a9cdab0b' \
 -e clientName='Kiltteystodiste' \
 -e purpose='Todista, että olet ollut kiltti' \
 -e CredentialManifest='https://verifiedid.did.msidentity.com/v1.0/tenants/39662e39-3e1d-455b-9013-c493ab830fd3/verifiableCredentials/contracts/dd9784d7-b4c8-9db3-012c-9b4e810f4756/manifest' \
 -e CredentialType='Kiltteystodiste' \
 -e acceptedIssuers='did:web:verifiedid.entra.microsoft.com:39662e39-3e1d-455b-9013-c493ab830fd3:0afc3875-fe0b-7b3e-98fa-fa24a9cdab0b' \
 -e issuancePinCodeLength=4 \
  kiltteystodiste:latest  
