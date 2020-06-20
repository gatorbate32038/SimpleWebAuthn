/* eslint-disable @typescript-eslint/ban-ts-comment */
import { TPM_ALG } from './constants';

/**
 * Break apart a TPM attestation's pubArea buffer
 */
export default function parsePubArea(pubArea: Buffer): ParsedPubArea {
  let pubBuffer: Buffer = pubArea;

  const typeBuffer = pubBuffer.slice(0, 2);
  pubBuffer = pubBuffer.slice(2);
  const type = TPM_ALG[typeBuffer.readUInt16BE(0)];

  const nameAlgBuffer = pubBuffer.slice(0, 2);
  pubBuffer = pubBuffer.slice(2);
  const nameAlg = TPM_ALG[nameAlgBuffer.readUInt16BE(0)];

  // Get some authenticator attributes(?)
  const objectAttributesInt = pubBuffer.slice(0, 4).readUInt32BE(0);
  pubBuffer = pubBuffer.slice(4);
  const objectAttributes = {
    fixedTPM: !!(objectAttributesInt & 1),
    stClear: !!(objectAttributesInt & 2),
    fixedParent: !!(objectAttributesInt & 8),
    sensitiveDataOrigin: !!(objectAttributesInt & 16),
    userWithAuth: !!(objectAttributesInt & 32),
    adminWithPolicy: !!(objectAttributesInt & 64),
    noDA: !!(objectAttributesInt & 512),
    encryptedDuplication: !!(objectAttributesInt & 1024),
    restricted: !!(objectAttributesInt & 32768),
    decrypt: !!(objectAttributesInt & 65536),
    signOrEncrypt: !!(objectAttributesInt & 131072),
  };

  // Slice out the authPolicy of dynamic length
  const authPolicyLength = pubBuffer.slice(0, 2).readUInt16BE(0);
  pubBuffer = pubBuffer.slice(2);
  const authPolicy = pubBuffer.slice(0, authPolicyLength);
  pubBuffer = pubBuffer.slice(authPolicyLength);

  // Extract additional curve params according to type
  const parameters: { rsa?: RSAParameters; ecc?: ECCParameters } = {};
  if (type === 'TPM_ALG_RSA') {
    const rsaBuffer = pubBuffer.slice(0, 10);
    pubBuffer = pubBuffer.slice(10);

    parameters.rsa = {
      symmetric: TPM_ALG[rsaBuffer.slice(0, 2).readUInt16BE(0)],
      scheme: TPM_ALG[rsaBuffer.slice(2, 4).readUInt16BE(0)],
      keyBits: rsaBuffer.slice(4, 6).readUInt16BE(0),
      exponent: rsaBuffer.slice(6, 10).readUInt16BE(0),
    };
  } else if (type === 'TPM_ALG_ECC') {
    const eccBuffer = pubBuffer.slice(0, 8);
    pubBuffer = pubBuffer.slice(8);

    parameters.ecc = {
      symmetric: TPM_ALG[eccBuffer.slice(0, 2).readUInt16BE(0)],
      scheme: TPM_ALG[eccBuffer.slice(2, 4).readUInt16BE(0)],
      curveID: TPM_ECC_CURVE[eccBuffer.slice(4, 6).readUInt16BE(0)],
      kdf: TPM_ALG[eccBuffer.slice(6, 8).readUInt16BE(0)],
    };
  } else {
    throw new Error(`Unexpected type "${type}" (TPM)`);
  }

  // Slice out unique of dynamic length
  const uniqueLength = pubBuffer.slice(0, 2).readUInt16BE(0);
  pubBuffer = pubBuffer.slice(2);
  const unique = pubBuffer.slice(0, uniqueLength);
  pubBuffer = pubBuffer.slice(uniqueLength);

  return {
    type,
    nameAlg,
    objectAttributes,
    authPolicy,
    parameters,
    unique,
  };
}

type ParsedPubArea = {
  type: string;
  nameAlg: string;
  objectAttributes: {
    fixedTPM: boolean;
    stClear: boolean;
    fixedParent: boolean;
    sensitiveDataOrigin: boolean;
    userWithAuth: boolean;
    adminWithPolicy: boolean;
    noDA: boolean;
    encryptedDuplication: boolean;
    restricted: boolean;
    decrypt: boolean;
    signOrEncrypt: boolean;
  };
  authPolicy: Buffer;
  parameters: {
    rsa?: RSAParameters;
    ecc?: ECCParameters;
  };
  unique: Buffer;
};

type RSAParameters = {
  symmetric: string;
  scheme: string;
  keyBits: number;
  exponent: number;
};

type ECCParameters = {
  symmetric: string;
  scheme: string;
  curveID: string;
  kdf: string;
};

const TPM_ECC_CURVE: { [key: number]: string } = {
  0x0000: 'TPM_ECC_NONE',
  0x0001: 'TPM_ECC_NIST_P192',
  0x0002: 'TPM_ECC_NIST_P224',
  0x0003: 'TPM_ECC_NIST_P256',
  0x0004: 'TPM_ECC_NIST_P384',
  0x0005: 'TPM_ECC_NIST_P521',
  0x0010: 'TPM_ECC_BN_P256',
  0x0011: 'TPM_ECC_BN_P638',
  0x0020: 'TPM_ECC_SM2_P256',
};
