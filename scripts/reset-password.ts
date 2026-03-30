import postgres from "postgres";
import bcrypt from "bcryptjs";

const EMAIL = "test@example.ru";
const PASSWORD = "1234567";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    const [user] = await sql`SELECT id, email FROM users WHERE email = ${EMAIL}`;

    if (!user) {
      console.error(`User with email "${EMAIL}" not found.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${user.id}`;

    console.log(`Password updated for user id=${user.id} email=${user.email}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
