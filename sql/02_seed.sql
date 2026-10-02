INSERT INTO dbo.Department (DepartmentID, DepartmentName, Location) VALUES
    (1, 'Engineering',     'Pune'),
    (2, 'Sales',           'Mumbai'),
    (3, 'Human Resources', NULL),
    (4, 'Research',        'Bengaluru');

INSERT INTO dbo.Employee (FirstName, LastName, DepartmentID, Salary, Bonus, HireDate) VALUES
    ('Priya','Dhare', 1, 150000.00, NULL,     '2015-04-01'),
    ('Rahul','Verma',  1, 120000.00, 15000.00, '2017-06-15'),
    ('Ananya','Sharma',   1,  95000.00, 15000.00, '2019-09-01'),
    ('Vikram','Singh',  1,  80000.00, NULL,     '2022-01-10'),
    ('Arjun','Mehta',  2, 140000.00, 30000.00, '2016-03-20'),
    ('Neha', 'Kapoor', 2,  70000.00, 45000.00, '2020-11-02'),
    ('Rohan', 'Das',    2,  60000.00, 25000.00, '2021-07-19'),
    ('Alia', 'Bhatt',  3,  60000.00, NULL,     '2018-02-05'),
    ('Inaya', 'Rajput',  3,  55000.00, 0.00,     '2023-05-22');
