import dotenv from 'dotenv';
dotenv.config();
import { Vonage } from '@vonage/server-sdk';
import * as fs from 'fs';
import { dirname } from 'path';

const applicationId = process.env.TEST_APPLICATION_ID;
const privateKeyPath = './private.key';

/**
 * Optional custom video API host.
 * When set, both the Vonage server SDK (session creation) and the NetworkTest
 * client (via initSessionOptions.apiUrl) will target this host instead of production.
 *
 * Set via the VIDEO_API_URL environment variable (or in .env).
 */
const videoApiUrl = process.env.VIDEO_API_URL || undefined;

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
  const vonageOptions = videoApiUrl ? { videoHost: videoApiUrl } : {};
  const vonage = new Vonage({
    applicationId,
    privateKey,
  }, vonageOptions);
  try {
    const session = await vonage.video.createSession({ mediaMode: 'routed' });
    const token = vonage.video.generateClientToken(session.sessionId);
    const { sessionId } = session;
    return { applicationId, sessionId, token };
  } catch (e) {
    console.error(e);
    throw e;
  }
}

async function writeCredentials(credentialsArray) {
  const [primary, faultyLogging, faultyApi] = credentialsArray;
  const credentials = {
    primary,
    faultyLogging,
    faultyApi,
    ...(videoApiUrl ? { apiUrl: videoApiUrl } : {}),
  };
  const filePath = './test/credentials.json';
  await fs.promises.mkdir(dirname(filePath), { recursive: true });
  return fs.promises.writeFile(filePath, JSON.stringify(credentials, null, 2));
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
  } catch (e) {
    console.error('Failed to generate test credentials', e);
  }
}

generateCredentials();
