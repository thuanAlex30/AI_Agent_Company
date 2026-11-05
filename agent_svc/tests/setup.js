// setup.js — chay truoc moi test agent: env test + DB chung
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32-ky-tu-cho-ci-du-dai';
process.env.DATABASE_PATH = process.env.DATABASE_PATH || '../data/bizops.db';
process.env.AGENT_INTERNAL_KEY = process.env.AGENT_INTERNAL_KEY || 'dev-agent-key';
