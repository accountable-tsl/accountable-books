if (!process.env.MIXPANEL_TOKEN) {
  process.env.MIXPANEL_TOKEN = 'test-mixpanel-token';
}

if (!process.env.APP_ENC_KEY_ID) {
  process.env.APP_ENC_KEY_ID = '1';
}

if (!process.env.APP_ENC_KEYS) {
  process.env.APP_ENC_KEYS = '1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
}
