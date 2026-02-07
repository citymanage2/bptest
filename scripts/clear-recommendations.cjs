const postgres = require('postgres');

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await sql`TRUNCATE TABLE recommendations CASCADE`;
    console.log('Recommendations table cleared');
  } catch(e) {
    console.log('Table might not exist yet, continuing...', e.message);
  }
  await sql.end();
}

main();
