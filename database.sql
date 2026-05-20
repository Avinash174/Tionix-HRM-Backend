-- Create Users Table
CREATE TABLE Users (
    id INT PRIMARY KEY IDENTITY(1,1),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'employee',
    createdAt DATETIME DEFAULT GETDATE()
);

-- Create Employees Table
CREATE TABLE Employees (
    id INT PRIMARY KEY IDENTITY(1,1),
    firstName VARCHAR(50) NOT NULL,
    lastName VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    position VARCHAR(50),
    department VARCHAR(50),
    salary DECIMAL(18, 2),
    hireDate DATETIME DEFAULT GETDATE()
);

-- Create Attendance Table
CREATE TABLE Attendance (
    id INT PRIMARY KEY IDENTITY(1,1),
    employeeId INT FOREIGN KEY REFERENCES Employees(id),
    date DATE DEFAULT GETDATE(),
    status VARCHAR(20), -- Present, Absent, Late
    createdAt DATETIME DEFAULT GETDATE()
);

-- Create UserSessions Table for Refresh Tokens
CREATE TABLE UserSessions (
    SessionID INT PRIMARY KEY IDENTITY(1,1),
    UserID INT NOT NULL,
    RefreshToken VARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE(),
    ExpiresAt DATETIME NOT NULL
);

-- Admin panel sessions (refresh tokens + device info)
IF OBJECT_ID(N'dbo.AdminSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AdminSessions (
        SessionID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AdminUserId NVARCHAR(50) NOT NULL,
        RefreshToken NVARCHAR(500) NOT NULL,
        DeviceInfo NVARCHAR(500) NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminSessions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        ExpiresAt DATETIME2 NOT NULL
    );
    CREATE INDEX IX_AdminSessions_AdminUserId ON dbo.AdminSessions (AdminUserId);
    CREATE UNIQUE INDEX UX_AdminSessions_RefreshToken ON dbo.AdminSessions (RefreshToken);
END;

-- Profile fields on dbo.AppUser (SQL Server). Run once if columns are missing.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.AppUser') AND name = N'ProfileImage')
    ALTER TABLE dbo.AppUser ADD ProfileImage NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.AppUser') AND name = N'Email')
    ALTER TABLE dbo.AppUser ADD Email NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.AppUser') AND name = N'Phone')
    ALTER TABLE dbo.AppUser ADD Phone NVARCHAR(30) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Attendance') AND name = N'Remark')
    ALTER TABLE dbo.Attendance ADD Remark NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Attendance') AND name = N'DeviceInfo')
    ALTER TABLE dbo.Attendance ADD DeviceInfo NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Attendance') AND name = N'PhotoPath')
    ALTER TABLE dbo.Attendance ADD PhotoPath NVARCHAR(500) NULL;

IF OBJECT_ID(N'dbo.marketing_attendance_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.marketing_attendance_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id NVARCHAR(50) NOT NULL,
        attendance_date DATE NOT NULL,
        punch_in_time DATETIME2 NOT NULL,
        punch_out_time DATETIME2 NULL,
        total_work_minutes INT NOT NULL CONSTRAINT DF_marketing_attendance_total_work_minutes DEFAULT (0),
        punch_in_latitude DECIMAL(10, 7) NOT NULL,
        punch_in_longitude DECIMAL(10, 7) NOT NULL,
        location_type NVARCHAR(50) NULL,
        location_id NVARCHAR(100) NULL,
        allowed_radius DECIMAL(10, 2) NULL,
        actual_distance_meters DECIMAL(10, 2) NULL,
        punch_in_status NVARCHAR(20) NOT NULL,
        punch_in_remark NVARCHAR(500) NULL,
        device_info NVARCHAR(MAX) NULL,
        user_ip NVARCHAR(100) NULL,
        user_agent NVARCHAR(500) NULL
    );
END;

IF OBJECT_ID(N'dbo.gps_attendance_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gps_attendance_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        employee_id NVARCHAR(50) NOT NULL,
        attendance_type NVARCHAR(20) NOT NULL,
        attendance_date DATE NOT NULL,
        recorded_at DATETIME2 NOT NULL,
        employee_latitude DECIMAL(10, 7) NOT NULL,
        employee_longitude DECIMAL(10, 7) NOT NULL,
        office_latitude DECIMAL(10, 7) NOT NULL,
        office_longitude DECIMAL(10, 7) NOT NULL,
        distance_meters DECIMAL(10, 2) NOT NULL,
        allowed_radius_meters DECIMAL(10, 2) NOT NULL,
        attendance_status NVARCHAR(20) NOT NULL
    );
END;

IF OBJECT_ID(N'dbo.AttendanceLocations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AttendanceLocations (
        LocationID INT IDENTITY(1,1) PRIMARY KEY,
        LocationName NVARCHAR(100) NOT NULL,
        Latitude DECIMAL(10, 7) NOT NULL,
        Longitude DECIMAL(10, 7) NOT NULL,
        AllowedRadius DECIMAL(10, 2) DEFAULT 100,
        LocationType NVARCHAR(50) DEFAULT 'OFFICE',
        IsActive BIT DEFAULT 1,
        CreatedAt DATETIME DEFAULT GETDATE()
    );

    -- Insert default office location provided by user (updated to screenshot coords)
    INSERT INTO dbo.AttendanceLocations (LocationName, Latitude, Longitude, AllowedRadius, LocationType)
    VALUES ('Main Office', 18.523511, 73.9311385, 100, 'OFFICE');
END;

IF OBJECT_ID(N'dbo.employee_live_locations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.employee_live_locations (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        emp_code NVARCHAR(50) NOT NULL,
        emp_name NVARCHAR(100) NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        accuracy_meters DECIMAL(10, 2) NULL,
        heading DECIMAL(10, 2) NULL,
        speed DECIMAL(10, 2) NULL,
        address NVARCHAR(500) NULL,
        device_info NVARCHAR(500) NULL,
        recorded_at DATETIME2 NOT NULL CONSTRAINT DF_employee_live_locations_recorded_at DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX IX_employee_live_locations_emp_code ON dbo.employee_live_locations (emp_code, recorded_at DESC);
END;
