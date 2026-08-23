import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';

/**
 * Location of the development JSON database.
 */
const path = resolve(process.cwd(), 'data/database.json');

/**
 * Initial administrator account.
 *
 * IMPORTANT:
 * This is development/reset seed data only.
 *
 * The plain-text password must never be written to database.json.
 * Only its Argon2 hash is persisted.
 */
const adminId = randomUUID();

const adminEmail = 'yiannis@manatos.gr';
const systemUserDate = new Date().toISOString();
const systemUserName = 'Admin';

const adminPasswordHash = await argon2.hash('admin', {
  type: argon2.argon2id,
});

/**
 * Initial database contents.
 *
 * Collections are keyed by their entity GUID.
 */
const data = {
  sysUsers: {
    [adminId]: {
      id: adminId,

      name: 'Admin',

      email: adminEmail,
      emailVerified: true,

      passwordHash: adminPasswordHash,
      passwordChangedAt: new Date().toISOString(),

      role: 'Admin',

      enabled: true,

      createdAt: systemUserDate,
      createdBy: systemUserName,
      updatedAt: systemUserDate,
      updatedBy: systemUserName,
    },
  },

  sysPrincipals: {},

  sysApplications: {},

  sysLicenses: {},

  sysExternalIdentities: {},

  sysUserPrincipals: {},

  sysUserInvitations: {},
};

/**
 * Replace the existing JSON database with the initial data.
 */
await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');

console.log(`Reset ${path}`);
console.log('');
console.log('Initial administrator created:');
console.log(`  Id:       ${adminId}`);
console.log('  UserName: Admin');
console.log('  Email:    $(adminEmail)');
console.log('  Password: admin');
console.log('  Role:     Admin');
console.log('  Verified: Yes');
console.log('  Enabled:  Yes');

console.log(' createdAt: ${systemUserDate}');
console.log(' createdBy: ${systemUserName}');
console.log(' updatedAt: ${systemUserDate}');
console.log(' updatedBy: ${systemUserName}');
