export const VERSION = {
  number: '2.0.0',
  build: process.env.REACT_APP_BUILD_NUMBER || 'local',
  commit: process.env.REACT_APP_COMMIT_HASH || 'development',
  environment: process.env.NODE_ENV || 'development',
  apiVersion: 'v2'
};
