import 'dotenv/config';
import { pool, runMigration } from '../db/client';

runMigration()
  .then(() => {
    console.log('Migration complete.');
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
