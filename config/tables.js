/**
 * Table names — PostgreSQL uses dbo.* import names; MySQL uses plain table names.
 */
const { tbl: dialectTbl, isMysql } = require("./dialect");

const tbl = (name) => dialectTbl(name);

module.exports = { tbl, isMysql };
