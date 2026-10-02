# Employee Compensation Service

A small backend service for an HR team. It manages employee records and answers questions about staff bonuses.

It's built as **HTTP-triggered Azure Functions** (Node.js) with a **SQL Server** database. Clients never talk to the
database directly. Every read and write goes through the API.

## How it works

```
Client  ──HTTP request──▶  Azure Function  ──▶  check the input  ──▶  SQL query  ──▶  SQL Server
Client  ◀──JSON + status code──────────────────────────────────────────── result ◀──┘
```

- **5 endpoints** to create, read, list, update and delete employees
- **6 report endpoints** for bonus questions
- All the calculations (totals, averages, percentages, ranking) happen **inside SQL**

## Tech used

| | |
|---|---|
| Language | JavaScript (Node.js 20 or 22) |
| API | Azure Functions v4 (`@azure/functions`) |
| Database | SQL Server (run locally in Docker) or Azure SQL |
| DB driver | `mssql` |

## Project structure

```
src/
  db.js                  # connects to the database and runs queries safely
  http.js                # shared helpers for responses and error handling
  functions/
    employees.js         # the 5 employee (CRUD) endpoints
    reports.js           # the 6 report endpoints
sql/
  01_schema.sql          # creates the Department and Employee tables
  02_seed.sql            # sample data
local.settings.example.json   # template for your local settings (copy it to local.settings.json)
host.json
package.json
```

## What you need

- Node.js 20 or 22
- Azure Functions Core Tools v4: `npm i -g azure-functions-core-tools@4`
- Docker Desktop (to run SQL Server locally), or any SQL Server / Azure SQL database

## How to run it

**1. Start SQL Server in Docker**

Pick a strong password (8+ characters with upper case, lower case, a number and a symbol):

```bash
docker run -d --name ecs-sql -e 'ACCEPT_EULA=Y' -e 'MSSQL_SA_PASSWORD=<YourStrongPassword>' -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
```

Wait about 20 seconds for it to start. (Next time, just run `docker start ecs-sql`.)

**2. Create the database, tables and sample data**

These commands ask for your SA password at a prompt, so it never appears in the command itself.

```bash
docker cp sql ecs-sql:/tmp/sql
docker exec -it ecs-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -Q "CREATE DATABASE EmployeeCompensation"
docker exec -it ecs-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -d EmployeeCompensation -i /tmp/sql/01_schema.sql -i /tmp/sql/02_seed.sql
```

You should see `(4 rows affected)` and `(9 rows affected)`.

**3. Add your connection string**

```bash
cp local.settings.example.json local.settings.json
```

Open `local.settings.json` and set:

```
Server=localhost,1433;Database=EmployeeCompensation;User Id=sa;Password=<YourStrongPassword>;Encrypt=true;TrustServerCertificate=true
```

This file is in `.gitignore`, so your password never gets committed.

**4. Install and start**

```bash
npm install
func start
```

You should see **11 functions** listed, running at `http://localhost:7071/api/...`.
(An `AzureWebJobsStorage` warning may show up. It's safe to ignore, because HTTP functions don't need storage.)

## API endpoints

### Employees

| Method | URL | What it does | Success |
|---|---|---|---|
| POST | `/api/employees` | Create an employee | 201 |
| GET | `/api/employees` | List all employees | 200 |
| GET | `/api/employees?departmentId=2` | List employees in one department | 200 |
| GET | `/api/employees/{id}` | Get one employee | 200 |
| PUT | `/api/employees/{id}` | Update an employee | 200 |
| DELETE | `/api/employees/{id}` | Delete an employee | 204 |

Example body for POST / PUT (`bonus`, `departmentId` and `hireDate` are optional):

```json
{
  "firstName": "Asha",
  "lastName": "Rao",
  "departmentId": 2,
  "salary": 85000,
  "bonus": 5000,
  "hireDate": "2024-06-01"
}
```

### Reports (all GET)

| URL | What it answers | Result with the sample data |
|---|---|---|
| `/api/reports/total-bonus` | Total bonus paid (no bonus counts as 0) | 130000 |
| `/api/reports/employees-without-bonus` | Who has never received a bonus | Priya, Vikram, Alia |
| `/api/reports/bonus-percentage` | Bonus as % of salary (2 decimals) | e.g. Ananya 15.79, Neha 64.29 |
| `/api/reports/departments-bonus-exceeds-average-salary` | Departments where total bonus > average salary | Sales (100000 > 90000) |
| `/api/reports/bonus-ranking` | Everyone ranked by bonus, no-bonus people last | Rahul & Ananya tie at 4; Priya, Vikram, Alia share last place |
| `/api/reports/highest-salary` | Top earner by salary, and whether they also have the highest total pay | Priya (150000), but **no**: Arjun has the highest total (170000) |

### Errors

Errors come back as JSON: `{ "error": "message" }`

- **400**: bad input (invalid JSON, missing or wrong fields, bad id, or a department that doesn't exist)
- **404**: employee not found
- **500**: something unexpected went wrong. The details are logged on the server, and the client just gets a general message.

## Quick test (Windows PowerShell)

```powershell
$api = "http://localhost:7071/api"

# Reports
Invoke-RestMethod "$api/reports/total-bonus"
Invoke-RestMethod "$api/reports/employees-without-bonus" | Format-Table
Invoke-RestMethod "$api/reports/bonus-ranking" | Format-Table bonusRank, firstName, bonus
Invoke-RestMethod "$api/reports/highest-salary" | Format-List

# Create, read, update, delete
$new = Invoke-RestMethod -Method Post -Uri "$api/employees" -ContentType 'application/json' -Body '{"firstName":"Asha","lastName":"Rao","departmentId":2,"salary":85000}'
$id = $new.employeeId
Invoke-RestMethod "$api/employees/$id"
Invoke-RestMethod -Method Put -Uri "$api/employees/$id" -ContentType 'application/json' -Body '{"firstName":"Asha","lastName":"Rao","departmentId":2,"salary":85000,"bonus":4000}'
Invoke-RestMethod -Method Delete -Uri "$api/employees/$id"
```

On macOS / Linux, the same URLs work with `curl`, e.g. `curl http://localhost:7071/api/reports/total-bonus`.

## About the sample data

The data is chosen so every report has something to show:
- 3 people with no bonus (Priya, Vikram, Alia) and 1 with a bonus of exactly 0 (Inaya)
- one department (Sales) where total bonus is higher than average salary
- an empty department (Research)
- two people with the same bonus (Rahul and Ananya), to show ties in the ranking
- the highest-salary person (Priya) has no bonus, so someone else (Arjun) has the highest total pay

## Assumptions

1. **No bonus = NULL.** A bonus of 0 still counts as a bonus (just zero), so Inaya shows up at 0% in the percentage
   report and isn't listed as "never received a bonus".
2. **DepartmentID and HireDate can be empty.** The assignment doesn't say they're required. If a department is given, it must exist.
3. **Update replaces the whole record (PUT).** Send all the fields. If you leave out `bonus`, it's cleared.
4. **Ties share a rank.** In the ranking, equal bonuses get the same rank, and everyone without a bonus shares the last rank.
   The highest-salary report returns everyone tied for the top salary.
5. **Total pay = salary + bonus**, with no bonus counted as 0.
6. **Empty departments are skipped** in the department report, since they have no average salary.
7. **Departments are only created by the seed script.** The assignment asks for employee CRUD only.

## Design choices

- **Calculations happen in SQL.** Databases are built for sums, averages and ranking, and NULL handling stays visible in the query.
- **Safe queries.** Every query uses parameters (`@id`, `@salary`, ...), so user input can never run as SQL. This prevents SQL injection.
- **No secrets in code.** The connection string only comes from settings: `local.settings.json` locally, App Settings in Azure.
- **One place for errors.** Expected problems return 400/404 with a clear message. Anything else is logged and returns a safe 500.
- **The database checks departments.** A foreign key rejects unknown departments, and the API turns that into a 400.
- **Kept simple.** No ORM or extra layers. Each endpoint just checks the input, runs one query and responds.

## Optional: default 5% bonus

This isn't implemented, but if I added it I would **calculate it when reading the data**, not save it into the table.

- Saving it would erase the difference between "no bonus" and "has a bonus", which several required reports depend on.
- A saved value would go out of date as soon as a salary changed.
- A rule like this may change, and a calculated value is easy to adjust or remove.

It would look like `COALESCE(Bonus, ROUND(Salary * 0.05, 2)) AS effectiveBonus`, returned next to the real bonus.
If HR decided the 5% is actually paid, I'd save it once with a deliberate update instead.

## Deploying to Azure
1. Create a Function App (Node.js) and an Azure SQL database, then run the two SQL scripts on it.
2. Publish the code with `func azure functionapp publish <app-name>`.
3. Add `SQL_CONNECTION_STRING` in **Function App → Settings → Environment variables**. No code changes are needed.
4. The endpoints use function keys in Azure, so callers send the key in the `x-functions-key` header.
