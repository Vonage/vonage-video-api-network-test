import dotenv from 'dotenv';
dotenv.config();
import { Vonage } from '@vonage/server-sdk';
import fse from 'fs-extra';
import * as fs from 'fs';
const applicationId = process.env.TEST_APPLICATION_ID;
const privateKeyPath = './private.key';

if (!applicationId) {
  console.error('Environment variable TEST_APPLICATION_ID is not set. Please set it before running this script.');
  process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error(
    `Private key file not found at path: ${privateKeyPath}. Please create or place your private.key file there.`
  );
  process.exit(1);
}

async function createSessionAndToken({applicationId, privateKey}) {
  const vonage = new Vonage({
    applicationId,
    privateKey,
  });
  try {
    const session = await vonage.video.createSession({ mediaMode: 'routed' });
    const token = vonage.video.generateClientToken(session.sessionId);
    const { sessionId } = session;
    return { applicationId, sessionId, token };
  } catch(e) {
    console.error(e);
    throw e;
  }
}

async function writeCredentials(credentialsArray) {
  const [primary, faultyLogging, faultyApi] = credentialsArray;
  const credentials = { primary, faultyLogging, faultyApi };
  return fse.outputJson('./test/credentials.json', credentials);
}

async function generateCredentials(){
  try {
    const privateKey = fs.readFileSync(privateKeyPath);

    const sessions = await Promise.all([
      createSessionAndToken({ applicationId, privateKey }),
      createSessionAndToken({ applicationId, privateKey }),
      createSessionAndToken({ applicationId, privateKey }),
    ]);

    await writeCredentials(sessions);
    console.info('Generated session credentials for test.');
  } catch(e) {
    console.error('Failed to generate test credentials', e);
  }
}

generateCredentials();
