
// src/lib/integrations-api.ts
'use client';

import { fetchAllRegistrationAuthorities } from './dms-api';

export type IntegrationType = 'AWS_IOT_CORE' | 'UNKNOWN';

export interface DiscoveredIntegration {
  id: string; // Composite key: ra.id + metadata key
  raId: string;
  raName: string;
  type: IntegrationType;
  typeName: string; // User-friendly name like "AWS IoT Core"
  configKey: string;
  config: any; // The value from the metadata
}

export async function discoverIntegrations(): Promise<DiscoveredIntegration[]> {
  const allRAs = await fetchAllRegistrationAuthorities();
  const integrations: DiscoveredIntegration[] = [];

  for (const ra of allRAs) {
    if (ra.metadata) {
      for (const key in ra.metadata) {
        if (key.startsWith('lamassu.io/iot/')) {
          let type: IntegrationType = 'UNKNOWN';
          let typeName = 'Unknown IoT Platform';

          if (key.startsWith('lamassu.io/iot/aws.')) {
            type = 'AWS_IOT_CORE';
            typeName = 'AWS IoT Core';
          }
          
          integrations.push({
            id: `${ra.id}-${key}`,
            raId: ra.id,
            raName: ra.name,
            type: type,
            typeName: typeName,
            configKey: key,
            config: ra.metadata[key],
          });
        }
      }
    }
  }

  return integrations;
}


export function policyBuilder (accountID: string, shadowName: string) {
  let shadowReplacer = "";
  if (shadowName !== "") {
      shadowReplacer = `name/${shadowName}/`;
  }

  const str = {
      Version: "2012-10-17",
      Statement: [
          {
              Effect: "Allow",
              Action: [
                  "iot:Connect"
              ],
              Resource: [
                  "arn:aws:iot:eu-west-1:ACCOUNTID:client/${iot:Connection.Thing.ThingName}"
              ]
          },
          {
              Effect: "Allow",
              Action: [
                  "iot:Publish"
              ],
              Resource: [
                  "arn:aws:iot:eu-west-1:ACCOUNTID:topic/$aws/things/${iot:Connection.Thing.ThingName}",
                  "arn:aws:iot:eu-west-1:ACCOUNTID:topic/$aws/things/${iot:Connection.Thing.ThingName}/shadow/SHADOWID*"
              ]
          },
          {
              Effect: "Allow",
              Action: [
                  "iot:Subscribe"
              ],
              Resource: [
                  // "arn:aws:iot:eu-west-1:ACCOUNTID:topicfilter/dt/lms/well-known/cacerts",
                  "arn:aws:iot:eu-west-1:ACCOUNTID:topicfilter/$aws/things/${iot:Connection.Thing.ThingName}",
                  "arn:aws:iot:eu-west-1:ACCOUNTID:topicfilter/$aws/things/${iot:Connection.Thing.ThingName}/shadow/SHADOWID*"
              ]
          },
          {
              Effect: "Allow",
              Action: [
                  "iot:Receive"
              ],
              Resource: [
                  // "arn:aws:iot:eu-west-1:ACCOUNTID:topic/dt/lms/well-known/cacerts",
                  "arn:aws:iot:eu-west-1:ACCOUNTID:topic/$aws/things/${iot:Connection.Thing.ThingName}",
                  "arn:aws:iot:eu-west-1:ACCOUNTID:topic/$aws/things/${iot:Connection.Thing.ThingName}/shadow/SHADOWID*"
              ]
          }
      ]
  };

  const jsonString = JSON.stringify(str, null, 2)
    .replaceAll("ACCOUNTID", accountID)
    .replaceAll("SHADOWID", shadowReplacer);

  return jsonString;
}
