import OTKLogger from '@opentok/opentok-solutions-logging';
import { SessionCredentials } from './types/session';

export default function addSessionInfo(
  otLogging: OTKLogger,
  session: OT.Session,
  { applicationId, sessionId }: SessionCredentials,
): void {
  const connectionId = session.connection?.connectionId;
  if (!connectionId) {
    return;
  }
  otLogging.addSessionInfo({ sessionId, connectionId, partnerId: applicationId });
}
