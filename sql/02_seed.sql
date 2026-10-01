-- Demonstration data. Run after 01_schema.sql.
--
-- Chosen so every report has something interesting to show:
--   * 3 employees with NULL bonus (Priya, Vikram, Sneha) and 1 with a bonus of 0.00 (Karan)
--   * Sales: total bonus 100,000 > average salary 90,000  -> appears in the department report
--     Engineering and Human Resources do not; Research has no employees
--   * Rahul and Ananya tie on bonus (15,000) -> shared rank in the bonus ranking
--   * Priya has the highest salary (150,000) but no bonus, so her total compensation is 150,000;
--     Arjun's total compensation (140,000 + 30,000 = 170,000) is the highest

INSERT INTO dbo.Department (DepartmentID, DepartmentName, Location) VALUES
    (1, 'Engineering',     'Pune'),
    (2, 'Sales',           'Mumbai'),
    (3, 'Human Resources', NULL),
    (4, 'Research',        'Bengaluru');

INSERT INTO dbo.Employee (FirstName, LastName, DepartmentID, Salary, Bonus, HireDate) VALUES
    ('Priya',   'Sharma', 1, 150000.00, NULL,     '2015-04-01'),
    ('Rahul',   'Verma',  1, 120000.00, 15000.00, '2017-06-15'),
    ('Ananya',  'Iyer',   1,  95000.00, 15000.00, '2019-09-01'),
    ('Vikram',  'Singh',  1,  80000.00, NULL,     '2022-01-10'),
    ('Arjun',   'Mehta',  2, 140000.00, 30000.00, '2016-03-20'),
    ('Neha',    'Kapoor', 2,  70000.00, 45000.00, '2020-11-02'),
    ('Rohan',   'Das',    2,  60000.00, 25000.00, '2021-07-19'),
    ('Sneha',   'Patil',  3,  60000.00, NULL,     '2018-02-05'),
    ('Karan',   'Joshi',  3,  55000.00, 0.00,     '2023-05-22');
