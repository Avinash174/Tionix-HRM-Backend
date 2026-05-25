/** Supabase tables migrated from SQL Server use dbo.* names in the public schema. */
const tbl = (name) => `"dbo.${name}"`;

module.exports = { tbl };
