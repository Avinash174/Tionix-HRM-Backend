-- ============================================================
-- HRM Backend — PostgreSQL Schema for Supabase
-- Run this in Supabase SQL Editor
-- ============================================================

-- AppUser table (core login table)
CREATE TABLE IF NOT EXISTS "AppUser" (
    "pkUserId"       TEXT PRIMARY KEY,
    "UserName"       VARCHAR(100) NOT NULL,
    "Password"       VARCHAR(255) NOT NULL,
    "fkEmpId"        NUMERIC      NULL,
    "fkLocationId"   INT          NULL,
    "fkECId"         INT          NULL,
    "SysDefined"     BOOLEAN      DEFAULT false,
    "AttendanceMode" VARCHAR(50)  NULL,
    "GeofencePoint"  TEXT         NULL,
    "ProfileImage"   VARCHAR(500) NULL,
    "Email"          VARCHAR(100) NULL,
    "Phone"          VARCHAR(30)  NULL,
    "LastStatus"     VARCHAR(50)  NULL
);

-- Employees table
CREATE TABLE IF NOT EXISTS "Employees" (
    id           SERIAL PRIMARY KEY,
    "firstName"  VARCHAR(50)     NOT NULL,
    "lastName"   VARCHAR(50)     NOT NULL,
    "email"      VARCHAR(100)    UNIQUE NOT NULL,
    "phone"      VARCHAR(20)     NULL,
    "position"   VARCHAR(50)     NULL,
    "department" VARCHAR(50)     NULL,
    "salary"     DECIMAL(18, 2)  NULL,
    "hireDate"   TIMESTAMPTZ     DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS "Attendance" (
    id              SERIAL PRIMARY KEY,
    "PayCode"       VARCHAR(50)   NULL,
    "EmpCode"       VARCHAR(50)   NOT NULL,
    "EmpName"       VARCHAR(100)  NULL,
    "AtDate"        TEXT          NULL,
    "PunchTime"     TEXT          NULL,
    "PunchDatetime" TIMESTAMPTZ   NULL,
    "Device"        VARCHAR(100)  NULL,
    "Punch"         VARCHAR(20)   NULL,
    "Manual"        VARCHAR(5)    NULL,
    "Status"        INT           NULL,
    "Latitude"      DECIMAL(10,7) NULL,
    "Longitude"     DECIMAL(10,7) NULL,
    "Address"       TEXT          NULL,
    "Remark"        TEXT          NULL,
    "DeviceInfo"    TEXT          NULL,
    "PhotoPath"     VARCHAR(500)  NULL
);

-- UserSessions table
CREATE TABLE IF NOT EXISTS "UserSessions" (
    "SessionID"    SERIAL PRIMARY KEY,
    "UserID"       TEXT         NOT NULL,
    "RefreshToken" TEXT         NOT NULL,
    "CreatedAt"    TIMESTAMPTZ  DEFAULT NOW(),
    "ExpiresAt"    TIMESTAMPTZ  NOT NULL
);

-- AdminSessions table
CREATE TABLE IF NOT EXISTS "AdminSessions" (
    "SessionID"    SERIAL PRIMARY KEY,
    "AdminUserId"  VARCHAR(50)  NOT NULL,
    "RefreshToken" VARCHAR(500) NOT NULL,
    "DeviceInfo"   VARCHAR(500) NULL,
    "CreatedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "ExpiresAt"    TIMESTAMPTZ  NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_admin_sessions_user_id ON "AdminSessions" ("AdminUserId");
CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_sessions_refresh_token ON "AdminSessions" ("RefreshToken");

-- AttendanceLocations table
CREATE TABLE IF NOT EXISTS "AttendanceLocations" (
    "LocationID"    SERIAL PRIMARY KEY,
    "LocationName"  VARCHAR(100)  NOT NULL,
    "Latitude"      DECIMAL(10,7) NOT NULL,
    "Longitude"     DECIMAL(10,7) NOT NULL,
    "Address"       TEXT          NULL,
    "AllowedRadius" DECIMAL(10,2) DEFAULT 25,
    "LocationType"  VARCHAR(50)   DEFAULT 'OFFICE',
    "IsActive"      BOOLEAN       DEFAULT true,
    "CreatedAt"     TIMESTAMPTZ   DEFAULT NOW()
);

-- GPS Attendance Logs
CREATE TABLE IF NOT EXISTS gps_attendance_logs (
    id                    BIGSERIAL PRIMARY KEY,
    employee_id           VARCHAR(50)   NOT NULL,
    attendance_type       VARCHAR(20)   NOT NULL,
    attendance_date       DATE          NOT NULL,
    recorded_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    employee_latitude     DECIMAL(10,7) NOT NULL,
    employee_longitude    DECIMAL(10,7) NOT NULL,
    employee_address      TEXT          NULL,
    office_latitude       DECIMAL(10,7) NOT NULL,
    office_longitude      DECIMAL(10,7) NOT NULL,
    distance_meters       DECIMAL(10,2) NOT NULL,
    allowed_radius_meters DECIMAL(10,2) NOT NULL,
    attendance_status     VARCHAR(20)   NOT NULL
);

-- Employee Live Locations
CREATE TABLE IF NOT EXISTS employee_live_locations (
    id              BIGSERIAL PRIMARY KEY,
    emp_code        VARCHAR(50)   NOT NULL,
    emp_name        VARCHAR(100)  NULL,
    latitude        DECIMAL(10,7) NOT NULL,
    longitude       DECIMAL(10,7) NOT NULL,
    accuracy_meters DECIMAL(10,2) NULL,
    heading         DECIMAL(10,2) NULL,
    speed           DECIMAL(10,2) NULL,
    address         VARCHAR(500)  NULL,
    device_info     VARCHAR(500)  NULL,
    is_suspicious   BOOLEAN       DEFAULT false,
    gps_risk_score  INT           NULL,
    gps_flags       VARCHAR(500)  NULL,
    recorded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_live_loc_emp_code ON employee_live_locations (emp_code, recorded_at DESC);
CREATE INDEX IF NOT EXISTS ix_live_loc_recorded_at ON employee_live_locations (recorded_at DESC);

-- EmpGeoLocation
CREATE TABLE IF NOT EXISTS "EmpGeoLocation" (
    id          SERIAL PRIMARY KEY,
    "fkEmpId"   NUMERIC       NOT NULL,
    "AtDate"    TIMESTAMPTZ   NOT NULL,
    "Latitude"  DECIMAL(10,7) NOT NULL,
    "Longitude" DECIMAL(10,7) NOT NULL
);

-- OfficeGeoFence
CREATE TABLE IF NOT EXISTS "OfficeGeoFence" (
    "pkGeoId"      SERIAL PRIMARY KEY,
    "fkHLId"       INT           NOT NULL,
    "OfficeName"   VARCHAR(100)  NULL,
    "Latitude"     DECIMAL(10,7) NOT NULL,
    "Longitude"    DECIMAL(10,7) NOT NULL,
    "RadiusMeters" INT           NOT NULL DEFAULT 50,
    "IsActive"     BOOLEAN       NOT NULL DEFAULT true,
    "CreatedAt"    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_office_geofence ON "OfficeGeoFence" ("fkHLId", "IsActive");

-- Marketing Attendance Logs
CREATE TABLE IF NOT EXISTS marketing_attendance_logs (
    id                    SERIAL PRIMARY KEY,
    user_id               VARCHAR(50)   NOT NULL,
    attendance_date       DATE          NOT NULL,
    punch_in_time         TIMESTAMPTZ   NOT NULL,
    punch_out_time        TIMESTAMPTZ   NULL,
    total_work_minutes    INT           NOT NULL DEFAULT 0,
    punch_in_latitude     DECIMAL(10,7) NOT NULL,
    punch_in_longitude    DECIMAL(10,7) NOT NULL,
    location_type         VARCHAR(50)   NULL,
    location_id           VARCHAR(100)  NULL,
    allowed_radius        DECIMAL(10,2) NULL,
    actual_distance_meters DECIMAL(10,2) NULL,
    punch_in_status       VARCHAR(20)   NOT NULL,
    punch_in_remark       VARCHAR(500)  NULL,
    device_info           TEXT          NULL,
    user_ip               VARCHAR(100)  NULL,
    user_agent            VARCHAR(500)  NULL
);
