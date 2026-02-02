#!/usr/bin/env python3
"""
Database reset script - Drops and recreates the database.
This script connects to PostgreSQL and recreates the database from scratch.
"""

import sys
import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from decouple import config, Config, RepositoryEnv


def get_db_config():
    """Get database configuration from separate environment variables."""
    # Get the project root directory (pesa-plan folder)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(script_dir, "..")
    env_file = os.path.join(project_root, ".env")

    # Create a config instance that reads from the .env file in project root
    env_config = Config(RepositoryEnv(env_file))

    try:
        return {
            "host": env_config("POSTGRES_DB_HOST", default="localhost"),
            "port": env_config("POSTGRES_DB_PORT", default=5432, cast=int),
            "user": env_config("POSTGRES_DB_USER", default="postgres"),
            "password": env_config("POSTGRES_DB_PASSWORD", default=""),
            "database": env_config("POSTGRES_DB_NAME_PESA_PLAN", default="postgres"),
        }
    except Exception as e:
        print(f"Error reading database configuration: {e}")
        print("Make sure POSTGRES_DB_HOST, POSTGRES_DB_PORT, POSTGRES_DB_USER, POSTGRES_DB_PASSWORD, and POSTGRES_DB_NAME_PESA_PLAN are set in .env")
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
