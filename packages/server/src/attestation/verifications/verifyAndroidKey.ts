import { AsnParser } from '@peculiar/asn1-schema';
import { Certificate } from '@peculiar/asn1-x509';
import { KeyDescription, id_ce_keyDescription } from '@peculiar/asn1-android';

import type { AttestationStatement } from '../../helpers/decodeAttestationObject';
import convertX509CertToPEM from '../../helpers/convertX509CertToPEM';
import verifySignature from '../../helpers/verifySignature';
import convertCOSEtoPKCS, { COSEALGHASH } from '../../helpers/convertCOSEtoPKCS';
import MetadataService from '../../metadata/metadataService';
import verifyAttestationWithMetadata from '../../metadata/verifyAttestationWithMetadata';

type Options = {
  authData: Buffer;
  clientDataHash: Buffer;
  attStmt: AttestationStatement;
  credentialPublicKey: Buffer;
  aaguid: Buffer;
};

export default async function verifyAttestationAndroidKey(options: Options): Promise<boolean> {
  const { authData, clientDataHash, attStmt, credentialPublicKey, aaguid } = options;
  const { x5c, sig, alg } = attStmt;

  if (!x5c) {
    throw new Error('No attestation certificate provided in attestation statement (AndroidKey)');
  }

  if (!sig) {
    throw new Error('No attestation signature provided in attestation statement (AndroidKey)');
  }

  if (!alg) {
    throw new Error(`Attestation statement did not contain alg (AndroidKey)`);
  }

  // Check that credentialPublicKey matches the public key in the attestation certificate
  // Find the public cert in the certificate as PKCS
  const parsedCert = AsnParser.parse(x5c[0], Certificate);
  const parsedCertPubKey = Buffer.from(
    parsedCert.tbsCertificate.subjectPublicKeyInfo.subjectPublicKey,
  );

  // Convert the credentialPublicKey to PKCS
  const credPubKeyPKCS = convertCOSEtoPKCS(credentialPublicKey);

  if (!credPubKeyPKCS.equals(parsedCertPubKey)) {
    throw new Error('Credential public key does not equal leaf cert public key (AndroidKey)');
  }

  // Find Android KeyStore Extension in certificate extensions
  const extKeyStore = parsedCert.tbsCertificate.extensions?.find(
    ext => ext.extnID === id_ce_keyDescription,
  );

  if (!extKeyStore) {
    throw new Error('Certificate did not contain extKeyStore (AndroidKey)');
  }

  const parsedExtKeyStore = AsnParser.parse(extKeyStore.extnValue, KeyDescription);

  // Verify extKeyStore values
  const { attestationChallenge, teeEnforced, softwareEnforced } = parsedExtKeyStore;

  if (!Buffer.from(attestationChallenge.buffer).equals(clientDataHash)) {
    throw new Error('Attestation challenge was not equal to client data hash (AndroidKey)');
  }

  // Ensure that the key is strictly bound to the caller app identifier (shouldn't contain the
  // [600] tag)
  if (teeEnforced.allApplications !== undefined) {
    throw new Error('teeEnforced contained "allApplications [600]" tag (AndroidKey)');
  }

  if (softwareEnforced.allApplications !== undefined) {
    throw new Error('teeEnforced contained "allApplications [600]" tag (AndroidKey)');
  }

  // TODO: Confirm that the root certificate is an expected certificate
  // const rootCertPEM = convertX509CertToPEM(x5c[x5c.length - 1]);
  // console.log(rootCertPEM);

  // if (rootCertPEM !== expectedRootCert) {
  //   throw new Error('Root certificate was not expected certificate (AndroidKey)');
  // }

  const statement = await MetadataService.getStatement(aaguid);
  if (statement) {
    try {
      await verifyAttestationWithMetadata(statement, alg, x5c);
    } catch (err) {
      throw new Error(`${err.message} (AndroidKey)`);
    }
  }

  const signatureBase = Buffer.concat([authData, clientDataHash]);
  const leafCertPEM = convertX509CertToPEM(x5c[0]);
  const hashAlg = COSEALGHASH[alg as number];

  return verifySignature(sig, signatureBase, leafCertPEM, hashAlg);
}

type KeyStoreExtensionDescription = {
  attestationVersion: number;
  attestationChallenge: Buffer;
  softwareEnforced: string[];
  teeEnforced: string[];
};

// TODO: Find the most up-to-date expected root cert, the one from Yuriy's article doesn't match
const expectedRootCert = ``;
