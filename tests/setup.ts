process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_test";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.CRON_SECRET = "test-cron-secret-1234567890";
