#!/usr/bin/env python3
"""
Database reset script - Drops and recreates the database.
This script connects to PostgreSQL and recreates the database from scratch.
"""

import sys
import os
from urllib.parse import urlparse, unquote
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from decouple import config, Config, RepositoryEnv


def get_db_config():
    """Get database configuration from DATABASE_URL environment variable."""
    # Get the project root directory (pesa-plan folder)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(script_dir, "..")
    env_file = os.path.join(project_root, ".env")

    # Create a config instance that reads from the .env file in project root
    env_config = Config(RepositoryEnv(env_file))

    try:
        database_url = env_config("PESA_PLAN_DATABASE_URL")
        if not database_url or not isinstance(database_url, str):
            raise ValueError("PESA_PLAN_DATABASE_URL is not set or is not a valid string")

        # Parse the database URL
        parsed = urlparse(str(database_url))

        # Validate required components
        if not parsed.hostname:
            raise ValueError("PESA_PLAN_DATABASE_URL is missing hostname")
        if not parsed.port:
            raise ValueError("PESA_PLAN_DATABASE_URL is missing port")
        if not parsed.username:
            raise ValueError("PESA_PLAN_DATABASE_URL is missing username")
        if parsed.password is None:
            raise ValueError("PESA_PLAN_DATABASE_URL is missing password")

        # Extract database name (remove leading slash)
        database = parsed.path.lstrip("/")
        if not database:
            raise ValueError("PESA_PLAN_DATABASE_URL is missing database name")

        return {
            "host": parsed.hostname,
            "port": parsed.port,
            "user": unquote(parsed.username),
            "password": unquote(parsed.password),
            "database": database,
        }
    except Exception as e:
        print(f"Error reading database configuration: {e}")
        print("Make sure PESA_PLAN_DATABASE_URL is set in .env")
        print("Format: postgresql://user:password@host:port/database_name")
        sys.exit(1)


def get_admin_connection(db_config):
    """Connect to PostgreSQL admin database (usually 'postgres')."""
    admin_config = db_config.copy()
    admin_config["database"] = "postgres"  # Connect to default postgres DB

    try:
        conn = psycopg2.connect(**admin_config)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        return conn
    except psycopg2.Error as e:
        print(f"Error connecting to PostgreSQL: {e}")
        sys.exit(1)


def drop_database(conn, db_name):
    """Drop database if it exists."""
    try:
        cursor = conn.cursor()
        # Terminate existing connections to the database
        cursor.execute(
            f"""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '{db_name}'
            AND pid <> pg_backend_pid();
            """
        )
        cursor.execute(f'DROP DATABASE IF EXISTS "{db_name}";')
        cursor.close()
        print(f"✓ Dropped database '{db_name}' if it existed")
    except psycopg2.Error as e:
        print(f"Error dropping database: {e}")
        sys.exit(1)


def create_database(conn, db_name):
    """Create a new database."""
    try:
        cursor = conn.cursor()
        cursor.execute(f'CREATE DATABASE "{db_name}";')
        cursor.close()
        print(f"✓ Created database '{db_name}'")
    except psycopg2.Error as e:
        print(f"Error creating database: {e}")
        sys.exit(1)


def main():
    """Main function to reset the database."""
    print("Resetting database...")

    # Change to project root directory to load .env file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(script_dir, "..")
    os.chdir(project_root)

    db_config = get_db_config()
    db_name = db_config["database"]

    print(f"Database name: {db_name}")
    print(f"Host: {db_config['host']}")
    print(f"Port: {db_config['port']}")
    print(f"User: {db_config['user']}")

    # Connect to admin database
    conn = get_admin_connection(db_config)

    try:
        # Drop database if exists
        drop_database(conn, db_name)

        # Create database
        create_database(conn, db_name)

        print(f"\n✓ Database '{db_name}' has been reset successfully!")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
