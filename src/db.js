const sql = require('mssql');

// Employee columns as returned by the API (camelCase, HireDate formatted as YYYY-MM-DD).
const EMPLOYEE_COLUMNS = `
    e.EmployeeID   AS employeeId,
    e.FirstName    AS firstName,
    e.LastName     AS lastName,
    e.DepartmentID AS departmentId,
    e.Salary       AS salary,
    e.Bonus        AS bonus,
    CONVERT(char(10), e.HireDate, 23) AS hireDate`;

let poolPromise;

// One connection pool per Functions host instance, created on first use and reused by every request.
function getPool() {
    if (!poolPromise) {
        const connectionString = process.env.SQL_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('SQL_CONNECTION_STRING app setting is not configured.');
        }
        poolPromise = new sql.ConnectionPool(connectionString).connect().catch((err) => {
            poolPromise = undefined; // allow the next request to retry
            throw err;
        });
    }
    return poolPromise;
}

// Runs a parameterized query. params: { name: { type: sql.Int, value: 1 }, ... }
async function query(text, params = {}) {
    const pool = await getPool();
    const request = pool.request();
    for (const [name, { type, value }] of Object.entries(params)) {
        request.input(name, type, value);
    }
    return request.query(text);
}

module.exports = { sql, query, EMPLOYEE_COLUMNS };
