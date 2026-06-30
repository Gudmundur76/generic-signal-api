import mysql from 'mysql2/promise';

async function main() {
  const dsn = process.env.DATABASE_URL!;
  const url = new URL(dsn.replace(/^mysql2?:\/\//, 'mysql://'));
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306', 10),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });

  // Show current distributionEvents schema
  try {
    const [rows] = await conn.execute('SHOW CREATE TABLE `distributionEvents`') as any;
    console.log('Current distributionEvents DDL:');
    console.log((rows as any[])[0]['Create Table']);
  } catch (e) {
    console.log('distributionEvents does not exist yet — creating...');
    await conn.execute(`CREATE TABLE IF NOT EXISTS \`distributionEvents\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`signalSource\` varchar(64) NOT NULL,
      \`gene\` varchar(32) NOT NULL,
      \`patentNumber\` varchar(32) NULL,
      \`sequence\` text NOT NULL,
      \`compositeScore\` int NOT NULL DEFAULT 0,
      \`partnerId\` int NOT NULL,
      \`status\` varchar(32) NOT NULL DEFAULT 'delivered',
      \`deliveredAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Created distributionEvents table');
  }

  await conn.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
