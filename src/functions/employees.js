const { app } = require('@azure/functions');
const { sql, query, EMPLOYEE_COLUMNS } = require('../db');
const { HttpError, jsonResponse, withErrorHandling, parseId } = require('../http');

const MAX_MONEY = 9999999999.99; // largest value DECIMAL(12,2) can hold
const FOREIGN_KEY_VIOLATION = 547; // SQL Server error number

function validateName(value, field) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new HttpError(400, `${field} is required and must be a non-empty string.`);
    }
    if (value.trim().length > 50) {
        throw new HttpError(400, `${field} must be at most 50 characters.`);
    }
    return value.trim();
}

function validateMoney(value, field, { allowZero }) {
    const isValid =
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (allowZero ? value >= 0 : value > 0) &&
        value <= MAX_MONEY &&
        Math.round(value * 100) / 100 === value; // at most 2 decimal places
    if (!isValid) {
        const lowerBound = allowZero ? 'zero or greater' : 'greater than zero';
        throw new HttpError(400, `${field} must be a number ${lowerBound} and at most ${MAX_MONEY}, with at most 2 decimal places.`);
    }
    return value;
}

function validateDepartmentId(value) {
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
        throw new HttpError(400, 'departmentId must be a positive integer or null.');
    }
    return value;
}

function validateHireDate(value) {
    if (value === undefined || value === null) return null;
    const isValid =
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value; // rejects e.g. 2023-02-30
    if (!isValid) {
        throw new HttpError(400, 'hireDate must be a valid date in YYYY-MM-DD format, or null.');
    }
    return value;
}

async function readEmployeeBody(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        throw new HttpError(400, 'Request body must be valid JSON.');
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object.');
    }

    return {
        firstName: validateName(body.firstName, 'firstName'),
        lastName: validateName(body.lastName, 'lastName'),
        departmentId: validateDepartmentId(body.departmentId),
        salary: validateMoney(body.salary, 'salary', { allowZero: false }),
        bonus: body.bonus === undefined || body.bonus === null
            ? null
            : validateMoney(body.bonus, 'bonus', { allowZero: true }),
        hireDate: validateHireDate(body.hireDate),
    };
}

function employeeParams(employee) {
    return {
        firstName: { type: sql.VarChar(50), value: employee.firstName },
        lastName: { type: sql.VarChar(50), value: employee.lastName },
        departmentId: { type: sql.Int, value: employee.departmentId },
        salary: { type: sql.Decimal(12, 2), value: employee.salary },
        bonus: { type: sql.Decimal(12, 2), value: employee.bonus },
        hireDate: { type: sql.Date, value: employee.hireDate },
    };
}

// Runs an insert/update and turns a foreign key violation into a 400 instead of a 500.
async function writeEmployee(text, params, departmentId) {
    try {
        return await query(text, params);
    } catch (err) {
        if (err.number === FOREIGN_KEY_VIOLATION) {
            throw new HttpError(400, `Department ${departmentId} does not exist.`);
        }
        throw err;
    }
}


async function createEmployee(request) {
    const employee = await readEmployeeBody(request);

    const result = await writeEmployee(`
        INSERT INTO dbo.Employee (FirstName, LastName, DepartmentID, Salary, Bonus, HireDate)
        VALUES (@firstName, @lastName, @departmentId, @salary, @bonus, @hireDate);

        SELECT ${EMPLOYEE_COLUMNS} FROM dbo.Employee e WHERE e.EmployeeID = SCOPE_IDENTITY();`,
        employeeParams(employee), employee.departmentId);

    return jsonResponse(201, result.recordset[0]);
}

async function getEmployee(request) {
    const id = parseId(request.params.id, 'id');

    const result = await query(
        `SELECT ${EMPLOYEE_COLUMNS} FROM dbo.Employee e WHERE e.EmployeeID = @id;`,
        { id: { type: sql.Int, value: id } });

    if (result.recordset.length === 0) {
        throw new HttpError(404, `Employee ${id} not found.`);
    }
    return jsonResponse(200, result.recordset[0]);
}

async function listEmployees(request) {
    const departmentIdParam = request.query.get('departmentId');
    const departmentId = departmentIdParam === null ? null : parseId(departmentIdParam, 'departmentId');

    const result = await query(`
        SELECT ${EMPLOYEE_COLUMNS}
        FROM dbo.Employee e
        WHERE @departmentId IS NULL OR e.DepartmentID = @departmentId
        ORDER BY e.EmployeeID;`,
        { departmentId: { type: sql.Int, value: departmentId } });

    return jsonResponse(200, result.recordset);
}


async function updateEmployee(request) {
    const id = parseId(request.params.id, 'id');
    const employee = await readEmployeeBody(request);

    const result = await writeEmployee(`
        UPDATE dbo.Employee
        SET FirstName = @firstName,
            LastName = @lastName,
            DepartmentID = @departmentId,
            Salary = @salary,
            Bonus = @bonus,
            HireDate = @hireDate
        WHERE EmployeeID = @id;

        SELECT ${EMPLOYEE_COLUMNS} FROM dbo.Employee e WHERE e.EmployeeID = @id;`,
        { ...employeeParams(employee), id: { type: sql.Int, value: id } }, employee.departmentId);

    if (result.recordset.length === 0) {
        throw new HttpError(404, `Employee ${id} not found.`);
    }
    return jsonResponse(200, result.recordset[0]);
}

async function deleteEmployee(request) {
    const id = parseId(request.params.id, 'id');

    const result = await query(
        'DELETE FROM dbo.Employee WHERE EmployeeID = @id;',
        { id: { type: sql.Int, value: id } });

    if (result.rowsAffected[0] === 0) {
        throw new HttpError(404, `Employee ${id} not found.`);
    }
    return { status: 204 };
}

app.http('createEmployee', { methods: ['POST'], route: 'employees', authLevel: 'function', handler: withErrorHandling(createEmployee) });
app.http('listEmployees', { methods: ['GET'], route: 'employees', authLevel: 'function', handler: withErrorHandling(listEmployees) });
app.http('getEmployee', { methods: ['GET'], route: 'employees/{id}', authLevel: 'function', handler: withErrorHandling(getEmployee) });
app.http('updateEmployee', { methods: ['PUT'], route: 'employees/{id}', authLevel: 'function', handler: withErrorHandling(updateEmployee) });
app.http('deleteEmployee', { methods: ['DELETE'], route: 'employees/{id}', authLevel: 'function', handler: withErrorHandling(deleteEmployee) });
