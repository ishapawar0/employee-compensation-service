# Employee Compensation Service

A small backend for an HR team to manage employee records and answer questions about staff bonuses.
It is a set of **HTTP-triggered Azure Functions** backed by **SQL Server / Azure SQL**. Clients never
touch the database directly. Every read and write goes through the functions.

## Architecture

```
Client ──HTTP──▶ Azure Function (route + method) ──▶ validate input ──▶ parameterized SQL (mssql pool) ──▶ SQL Server
                                                                                                             │
Client ◀──JSON + status code── handler / error wrapper ◀──────────────── result rows ◀──────────────────────────┘
```

- **Employee CRUD** (5 functions) and **compensation reports** (6 functions).
- All calculations (sums, averages, percentages, ranking, comparisons) are done **in SQL**, not in JavaScript.
- One shared connection pool per Functions host, configured from an app setting.

## Technology stack

| | |
|---|---|
| Runtime | Node.js LTS (20 or 22), JavaScript |
| Functions | Azure Functions v4 programming model (`@azure/functions`) |
| Database | SQL Server 2019+ or Azure SQL Database |
| DB driver | `mssql` (pure JavaScript, no ODBC driver needed) |

No other runtime dependencies.

## Project structure

```
src/
  functions/
    employees.js   # 5 CRUD functions + request validation
    reports.js     # 6 report functions (SQL does the calculations)
  db.js            # connection pool from SQL_CONNECTION_STRING, query helper, shared employee columns
  http.js          # JSON responses, HttpError, error-handling wrapper, id parsing
sql/
  01_schema.sql    # creates Department and Employee (PKs, identity, FK, nullability)
  02_seed.sql      # demonstration data covering every report
host.json
local.settings.example.json   # placeholder config; copy to local.settings.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or 22
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local) (`npm i -g azure-functions-core-tools@4`)
- A SQL Server instance. The steps below use **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** to run
  SQL Server locally, so nothing else needs installing. Docker is only a convenient local database: it is not part of the
  application. Any SQL Server or Azure SQL Database works (see [Using an existing SQL Server](#using-an-existing-sql-server)).

## Setup and run locally

Commands work in PowerShell and in bash/zsh unless marked otherwise. Run them from the project folder.

**1. Start SQL Server in Docker**

Choose your own strong SA password (at least 8 characters with upper case, lower case, a digit and a symbol) and put it
in place of `<YourStrongPassword>`. You will use the same password in steps 2 and 3.

```bash
docker run -d --name ecs-sql -e 'ACCEPT_EULA=Y' -e 'MSSQL_SA_PASSWORD=<YourStrongPassword>' -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
```

Wait 15–30 seconds, then check it is ready. Look for `SQL Server is now ready for client connections`:

```bash
docker logs ecs-sql
```

If the container already exists from an earlier run, start it instead with `docker start ecs-sql`.

**2. Create the database and tables**

The commands below run `sqlcmd` inside the container. Because `-P` is not given, `sqlcmd` **prompts for the SA password**,
so the password is never typed into the command line or shell history.

```bash
docker cp sql ecs-sql:/tmp/sql
docker exec -it ecs-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -Q "CREATE DATABASE EmployeeCompensation"
docker exec -it ecs-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -d EmployeeCompensation -i /tmp/sql/01_schema.sql -i /tmp/sql/02_seed.sql
```

- `docker cp` copies the SQL scripts into the container.
- The second command creates the database.
- The third creates the tables (`01_schema.sql`) and loads the demonstration data (`02_seed.sql`).

`01_schema.sql` drops and recreates the tables, so re-running the last command resets the data.

To check the seed data loaded (expect 9 employees and 4 departments):

```bash
docker exec -it ecs-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -d EmployeeCompensation -Q "SELECT COUNT(*) FROM dbo.Employee; SELECT COUNT(*) FROM dbo.Department"
```

**3. Configure the connection string**

```bash
cp local.settings.example.json local.settings.json
```

Open `local.settings.json` and set `SQL_CONNECTION_STRING`, using `sa` and the password from step 1:

```
Server=localhost,1433;Database=EmployeeCompensation;User Id=sa;Password=<YourStrongPassword>;Encrypt=true;TrustServerCertificate=true
```

`local.settings.json` is git-ignored, so the password never reaches source control. The code reads the value only from
the `SQL_CONNECTION_STRING` setting, and nothing secret is hardcoded.

**4. Install dependencies and start the Functions host**

```bash
npm install
func start
```

The startup log lists **11 functions** under `Functions:`:

```
createEmployee, listEmployees, getEmployee, updateEmployee, deleteEmployee,
totalBonus, employeesWithoutBonus, bonusPercentage, departmentsBonusExceedsAverageSalary, bonusRanking, highestSalary
```

They are served at `http://localhost:7071/api/...`. The log may repeat an `AzureWebJobsStorage` warning. It is harmless,
because HTTP-triggered functions don't need a storage account. Press `Ctrl+C` to stop.

**5. Stop the database when finished** (data is kept): `docker stop ecs-sql`

### Using an existing SQL Server

If you have SQL Server, Azure SQL or another instance instead of Docker:
1. Create a database named `EmployeeCompensation`.
2. Run `sql/01_schema.sql` and then `sql/02_seed.sql` against it, using `sqlcmd`, SSMS, Azure Data Studio or the Azure portal query editor.
3. Point `SQL_CONNECTION_STRING` at it. For Azure SQL, use
   `Server=tcp:<server>.database.windows.net,1433;Database=EmployeeCompensation;User Id=<user>;Password=<password>;Encrypt=true`
   without `TrustServerCertificate`.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Login failed for user 'sa'` | The password in `local.settings.json` (or typed at the prompt) doesn't match the container's SA password |
| Every endpoint returns 500 | SQL Server isn't running or the connection string is wrong. The Functions log shows the details |
| `docker run` fails: port 1433 in use | Another SQL Server is already using the port. Stop it, or map another port (`-p 1434:1433`) and use `localhost,1434` |
| `func start`: port 7071 in use | Another `func` host is still running. Close it first |

### Running in Azure

Deploy with `func azure functionapp publish <app-name>`, and set `SQL_CONNECTION_STRING` under
**Function App → Settings → Environment variables (App settings)**. It is read from the environment exactly as in local
development, so no code changes are needed. Functions use `authLevel: 'function'`, so callers in Azure must send a function key
(`x-functions-key` header or `?code=`). Keys are not enforced when running locally.

## Endpoints

### Employees

| Method | Route | Success | Errors |
|---|---|---|---|
| POST | `/api/employees` | 201 + created employee | 400 invalid body / unknown department |
| GET | `/api/employees` | 200 + array | 400 invalid `departmentId` |
| GET | `/api/employees?departmentId={id}` | 200 + array (filtered) | 400 invalid `departmentId` |
| GET | `/api/employees/{id}` | 200 + employee | 400 invalid id, 404 not found |
| PUT | `/api/employees/{id}` | 200 + updated employee | 400 invalid id / body / unknown department, 404 not found |
| DELETE | `/api/employees/{id}` | 204 | 400 invalid id, 404 not found |

Request body for POST and PUT:

```json
{
  "firstName": "Asha",
  "lastName": "Rao",
  "departmentId": 2,
  "salary": 85000.00,
  "bonus": 5000.00,
  "hireDate": "2024-06-01"
}
```

| Field | Rule |
|---|---|
| `firstName`, `lastName` | required, non-empty, max 50 characters (trimmed) |
| `salary` | required number, > 0, max 9,999,999,999.99, at most 2 decimals |
| `bonus` | optional, number ≥ 0 with at most 2 decimals; omitted or `null` = no bonus |
| `departmentId` | optional positive integer that must exist in `Department`, or `null` |
| `hireDate` | optional `YYYY-MM-DD`, or `null` |

### Reports (all GET)

| Route | Returns |
|---|---|
| `/api/reports/total-bonus` | `{ "totalBonus": n }`. Sum of all bonuses, NULL counted as 0 |
| `/api/reports/employees-without-bonus` | Employees whose bonus is NULL |
| `/api/reports/bonus-percentage` | Employees with a bonus, plus `bonusPercentage` (bonus / salary × 100, 2 dp) |
| `/api/reports/departments-bonus-exceeds-average-salary` | Departments where total bonus > average salary, with both values |
| `/api/reports/bonus-ranking` | All employees with `bonusRank`, highest bonus first, NULL bonuses ranked last |
| `/api/reports/highest-salary` | Employee(s) with the highest salary, with `totalCompensation`, the company's `highestTotalCompensation`, and `hasHighestTotalCompensation` |

### Errors

Error responses are JSON: `{ "error": "message" }`.
- **400**: invalid JSON, missing or invalid fields, invalid id, or a non-existent department (the FK violation is mapped to 400)
- **404**: employee not found
- **500**: unexpected or database error. The client gets a generic message, and the details are logged to the Functions log.

## How to test

With the seed data loaded and `func start` running, use a second terminal.

**bash / zsh (macOS, Linux, Git Bash)**

```bash
# Reports. Expected values with the seed data are in the comments.
curl http://localhost:7071/api/reports/total-bonus                                # 130000
curl http://localhost:7071/api/reports/employees-without-bonus                    # Priya, Vikram, Sneha
curl http://localhost:7071/api/reports/bonus-percentage                           # e.g. Ananya 15.79, Neha 64.29
curl http://localhost:7071/api/reports/departments-bonus-exceeds-average-salary   # Sales: 100000 > 90000
curl http://localhost:7071/api/reports/bonus-ranking                              # Rahul & Ananya tie at 4; NULLs share rank 7
curl http://localhost:7071/api/reports/highest-salary                             # Priya 150000; false (Arjun has 170000)

# CRUD. The create response contains the new employeeId; use it in place of {id}.
curl -i -X POST http://localhost:7071/api/employees -H "Content-Type: application/json" \
     -d '{"firstName":"Asha","lastName":"Rao","departmentId":2,"salary":85000,"hireDate":"2024-06-01"}'
curl http://localhost:7071/api/employees/{id}
curl "http://localhost:7071/api/employees?departmentId=2"
curl -X PUT http://localhost:7071/api/employees/{id} -H "Content-Type: application/json" \
     -d '{"firstName":"Asha","lastName":"Rao","departmentId":2,"salary":85000,"bonus":4000,"hireDate":"2024-06-01"}'
curl -i -X DELETE http://localhost:7071/api/employees/{id}                        # 204

# Error cases
curl -i http://localhost:7071/api/employees/abc                                   # 400
curl -i http://localhost:7071/api/employees/99999                                 # 404
curl -i -X POST http://localhost:7071/api/employees -H "Content-Type: application/json" \
     -d '{"firstName":"A","lastName":"B","salary":1000,"departmentId":999}'      # 400 unknown department
```

**Windows PowerShell**

In Windows PowerShell, `curl` is an alias for `Invoke-WebRequest`, so use `Invoke-RestMethod` (or `curl.exe`):

```powershell
$api = "http://localhost:7071/api"

# Reports
Invoke-RestMethod "$api/reports/total-bonus"
Invoke-RestMethod "$api/reports/employees-without-bonus" | Format-Table
Invoke-RestMethod "$api/reports/bonus-percentage" | Format-Table
Invoke-RestMethod "$api/reports/departments-bonus-exceeds-average-salary" | Format-Table
Invoke-RestMethod "$api/reports/bonus-ranking" | Format-Table bonusRank, employeeId, firstName, bonus
Invoke-RestMethod "$api/reports/highest-salary" | Format-List

# CRUD (the new id is captured in $id)
$new = Invoke-RestMethod -Method Post -Uri "$api/employees" -ContentType 'application/json' -Body '{"firstName":"Asha","lastName":"Rao","departmentId":2,"salary":85000,"hireDate":"2024-06-01"}'
$id = $new.employeeId
Invoke-RestMethod "$api/employees/$id"
Invoke-RestMethod "$api/employees?departmentId=2" | Format-Table
Invoke-RestMethod -Method Put -Uri "$api/employees/$id" -ContentType 'application/json' -Body '{"firstName":"Asha","lastName":"Rao","departmentId":2,"salary":85000,"bonus":4000,"hireDate":"2024-06-01"}'
(Invoke-WebRequest -Method Delete -Uri "$api/employees/$id" -UseBasicParsing).StatusCode   # 204

# Error cases (curl.exe shows the status line)
curl.exe -i "$api/employees/abc"      # 400
curl.exe -i "$api/employees/99999"    # 404
```

The seed data is designed so every report has something to show:
- three NULL bonuses and one bonus of 0
- exactly one department (Sales) where total bonus exceeds average salary
- a department with no employees (Research)
- a tie in bonus amount
- a highest-salary employee (Priya, no bonus) who does **not** have the highest total compensation (Arjun)

## Assumptions

1. **`DepartmentID` and `HireDate` are nullable.** The assignment states nullability for every other column but not
   these two, so no NOT NULL constraint was added. The API accepts `null` or omits them. If a department is given, it must exist.
2. **"No bonus" means `Bonus IS NULL`**, as the spec defines. A bonus of `0` is treated as an awarded bonus of zero, so it
   appears in the bonus-percentage report (0%) and not in the "never received a bonus" list. There's no bonus history,
   so "never received" means "has no bonus now".
3. **Departments are created by the seed script only.** Part A asks for employee CRUD only, so there are no department endpoints.
4. **Update is a full replacement (PUT).** Every field is taken from the body, so `"bonus": null` (or omitting `bonus`) clears it.
   This avoids any ambiguity between "field not sent" and "set to null".
5. **Ties.** Report 6 returns *every* employee tied on the highest salary, and `hasHighestTotalCompensation` is true when their
   total equals the company maximum (which may itself be tied). Report 5 uses `RANK()`, so equal bonuses share a rank and all
   no-bonus employees share the last rank.
6. **Total compensation = Salary + Bonus, with NULL bonus as 0.** It uses the stored bonus.
7. **Department report** only considers departments that have employees, because a department with no employees has no average salary.
8. **Validation limits** come from the column definitions: names ≤ 50 characters, money fits `DECIMAL(12,2)`. Salary must be > 0
   so bonus percentage never divides by zero, and bonus must be ≥ 0.

## Design decisions

- **Calculations in SQL.** Aggregates, ranking and comparisons run in the database, so the functions return only the result rows
  and NULL handling is explicit in the queries (`IS NULL`, `COALESCE`).
- **Explicit NULL ordering in the ranking.** `CASE WHEN Bonus IS NULL THEN 1 ELSE 0 END` is the first sort key, so NULLs are last
  regardless of the database's default NULL sort behavior.
- **Parameterized queries everywhere** (`request.input(name, type, value)`), which prevents SQL injection and gives correct typing.
- **Foreign key enforced by the database.** An unknown department is caught from SQL error 547 and returned as 400, instead of a
  separate "does it exist?" query that could race.
- **No secrets in code.** The connection string comes only from the `SQL_CONNECTION_STRING` setting (`local.settings.json` locally,
  App Settings in Azure). The committed example file contains placeholders.
- **Single error wrapper.** Expected errors (`HttpError`) become 4xx. Anything else is logged and returned as a generic 500.
- **Deliberately minimal.** No ORM, framework, or service/repository layers. Each handler is: validate → one parameterized query → respond.

## Optional: default bonus of 5% of salary

**Not implemented.** Part C lists this as optional. If it were added, I would **calculate it when reading**, not write it into the table.

Why calculate on read:
- **It keeps the difference between "no bonus" and "awarded a bonus".** The required reports depend on `Bonus IS NULL`.
  If 5% were written into the column, "employees who never received a bonus" would become empty, the company bonus total
  would include money nobody was awarded, and the ranking could no longer put no-bonus employees last.
- **It can't go stale.** A stored 5% would be wrong as soon as the salary changed. A calculated one always matches the current salary.
- **It's a policy, and policies change.** Changing the rate (or dropping the rule) is a one-line query change with no data migration,
  and it is fully reversible.

How it would look: an extra calculated column such as `COALESCE(e.Bonus, ROUND(e.Salary * 0.05, 2)) AS effectiveBonus` alongside the
real `bonus` (or behind an opt-in query parameter), leaving `Bonus` itself untouched.

When writing it would be right instead: if HR decides the 5% is actually *awarded* and paid, it becomes real data. Then it should be a
deliberate, one-off, auditable update (`UPDATE dbo.Employee SET Bonus = ROUND(Salary * 0.05, 2) WHERE Bonus IS NULL`), not
something the read path does silently.
