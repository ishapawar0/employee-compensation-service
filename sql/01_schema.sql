-- Creates the two tables required by the assignment.
-- Run against the target database (e.g. EmployeeCompensation). Safe to re-run: drops existing tables first.

IF OBJECT_ID('dbo.Employee', 'U') IS NOT NULL DROP TABLE dbo.Employee;
IF OBJECT_ID('dbo.Department', 'U') IS NOT NULL DROP TABLE dbo.Department;
GO

CREATE TABLE dbo.Department (
    DepartmentID   INT          NOT NULL,
    DepartmentName VARCHAR(100) NOT NULL,
    Location       VARCHAR(100) NULL,
    CONSTRAINT PK_Department PRIMARY KEY (DepartmentID)
);
GO

-- DepartmentID and HireDate have no nullability stated in the assignment, so they are left NULL-able (see README).
CREATE TABLE dbo.Employee (
    EmployeeID   INT IDENTITY(1,1) NOT NULL,
    FirstName    VARCHAR(50)       NOT NULL,
    LastName     VARCHAR(50)       NOT NULL,
    DepartmentID INT               NULL,
    Salary       DECIMAL(12,2)     NOT NULL,
    Bonus        DECIMAL(12,2)     NULL,      
    HireDate     DATE              NULL,
    CONSTRAINT PK_Employee PRIMARY KEY (EmployeeID),
    CONSTRAINT FK_Employee_Department FOREIGN KEY (DepartmentID) REFERENCES dbo.Department (DepartmentID)
);
GO
