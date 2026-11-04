export default {
  dialect: 'sqlite',
  schema: './server/db/schema.js',
  out: './server/db/migrations',
  dbCredentials: {
    url: './data/onebox.db',
  },
};
