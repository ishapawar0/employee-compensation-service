const { app } = require('@azure/functions');
const { query, EMPLOYEE_COLUMNS } = require('../db');
const { jsonResponse, withErrorHandling } = require('../http');

// 1. Total bonus paid across the company.
async function totalBonus() {
    const result = await query(`
        SELECT COALESCE(SUM(COALESCE(Bonus, 0)), 0) AS totalBonus
        FROM dbo.Employee;`);

    return jsonResponse(200, result.recordset[0]);
}

// 2. Employees who have never received a bonus
async function employeesWithoutBonus() {
    const result = await query(`
        SELECT ${EMPLOYEE_COLUMNS}
        FROM dbo.Employee e
        WHERE e.Bonus IS NULL
        ORDER BY e.EmployeeID;`);

    return jsonResponse(200, result.recordset);
}

// 3. Bonus as a percentage of salary, rounded to 2 decimal places, for employees who have a bonus
async function bonusPercentage() {
    const result = await query(`
        SELECT ${EMPLOYEE_COLUMNS},
               CAST(ROUND(e.Bonus * 100.0 / NULLIF(e.Salary, 0), 2) AS DECIMAL(9,2)) AS bonusPercentage
        FROM dbo.Employee e
        WHERE e.Bonus IS NOT NULL
        ORDER BY e.EmployeeID;`);

    return jsonResponse(200, result.recordset);
}

// 4. Departments whose total bonus (NULL counted as 0) exceeds the department's average salary.
async function departmentsBonusExceedsAverageSalary() {
    const result = await query(`
        SELECT d.DepartmentID   AS departmentId,
               d.DepartmentName AS departmentName,
               d.Location       AS location,
               SUM(COALESCE(e.Bonus, 0))         AS totalBonus,
               CAST(AVG(e.Salary) AS DECIMAL(12,2)) AS averageSalary
        FROM dbo.Department d
        INNER JOIN dbo.Employee e ON e.DepartmentID = d.DepartmentID
        GROUP BY d.DepartmentID, d.DepartmentName, d.Location
        HAVING SUM(COALESCE(e.Bonus, 0)) > AVG(e.Salary)
        ORDER BY d.DepartmentID;`);

    return jsonResponse(200, result.recordset);
}

// 5. Employees ranked by bonus, highest first. Employees with no bonus are ranked last, not excluded.
async function bonusRanking() {
    const result = await query(`
        SELECT CAST(RANK() OVER (ORDER BY CASE WHEN e.Bonus IS NULL THEN 1 ELSE 0 END, e.Bonus DESC) AS INT) AS bonusRank,
               ${EMPLOYEE_COLUMNS}
        FROM dbo.Employee e
        ORDER BY bonusRank, e.EmployeeID;`);

    return jsonResponse(200, result.recordset);
}

// 6.Employee(s) with the highest base salary, and separately whether each also has the highest

async function highestSalary() {
    const result = await query(`
        WITH Compensation AS (
            SELECT e.*, e.Salary + COALESCE(e.Bonus, 0) AS TotalCompensation
            FROM dbo.Employee e
        )
        SELECT ${EMPLOYEE_COLUMNS},
               e.TotalCompensation AS totalCompensation,
               (SELECT MAX(TotalCompensation) FROM Compensation) AS highestTotalCompensation,
               CAST(CASE WHEN e.TotalCompensation = (SELECT MAX(TotalCompensation) FROM Compensation)
                         THEN 1 ELSE 0 END AS BIT) AS hasHighestTotalCompensation
        FROM Compensation e
        WHERE e.Salary = (SELECT MAX(Salary) FROM dbo.Employee)
        ORDER BY e.EmployeeID;`);

    return jsonResponse(200, result.recordset);
}

const reports = [
    ['totalBonus', 'reports/total-bonus', totalBonus],
    ['employeesWithoutBonus', 'reports/employees-without-bonus', employeesWithoutBonus],
    ['bonusPercentage', 'reports/bonus-percentage', bonusPercentage],
    ['departmentsBonusExceedsAverageSalary', 'reports/departments-bonus-exceeds-average-salary', departmentsBonusExceedsAverageSalary],
    ['bonusRanking', 'reports/bonus-ranking', bonusRanking],
    ['highestSalary', 'reports/highest-salary', highestSalary],
];

for (const [name, route, handler] of reports) {
    app.http(name, { methods: ['GET'], route, authLevel: 'function', handler: withErrorHandling(handler) });
}
