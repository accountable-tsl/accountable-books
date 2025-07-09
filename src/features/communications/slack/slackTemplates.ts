import { KnownBlock } from "@slack/types";
import { AlertBlockParams, UserCallbackBlockParams } from "./slack.types";

export function userCallbackRequestBlock({
  email,
  phone,
  timestamp,
}: UserCallbackBlockParams): KnownBlock[] {
  return [
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:telephone_receiver: User <mailto:${email}|${email}> requested a call back on <tel:${phone}|${phone}>`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "plain_text",
          text: `Time: ${timestamp}`,
          emoji: true,
        },
      ],
    },
  ];
}
export function alertBlock({
  title,
  message,
  timestamp,
}: AlertBlockParams): KnownBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: title,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: message,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "plain_text",
          text: `Time: ${timestamp}`,
          emoji: true,
        },
      ],
    },
  ];
}
