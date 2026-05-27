import type { KnownBlock } from '@slack/types';
import Slack from '@slack/bolt';

import { ENV } from '../../../config/env.js';
import { errorResponse } from '../../../shared/utils/response.utils.js';
import { userCallbackRequestBlock } from './slackTemplates.js';

import type { SlackMessageInput } from './slack.types.js';

const slackApp = new Slack.App({
  token: ENV.SLACK_BOT_TOKEN,
  signingSecret: ENV.SLACK_SIGNING_SECRET,
});

/* 
How to use...
await sendSlackMessage({
  block: {
    type: "userCallback",
    params: {
      email: "user@email.com",
      phone: "09097902782",
      timestamp: "10:58am Wed Aug 10 2025",
    },
  },
});

await sendSlackMessage({
  text: "Simple text message to Slack",
});
*/

export async function sendSlackMessage(
  input: SlackMessageInput,
): Promise<void> {
  const channel = input.channel || ENV.SLACK_CHANNEL || 'sandbox';

  let text = 'New Slack notification';
  let blocks: KnownBlock[] | undefined;

  if ('text' in input) {
    text = input.text;
  } else if ('block' in input) {
    switch (input.block.type) {
      case 'userCallback':
        blocks = userCallbackRequestBlock(input.block.params);
        break;
    }
  }

  try {
    await slackApp.client.chat.postMessage({
      token: ENV.SLACK_BOT_TOKEN,
      channel,
      text,
      blocks,
    });
  } catch (err: any) {
    errorResponse('Slack message failed', err);
  }
}
