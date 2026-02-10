-- Add actionId column to Link table
ALTER TABLE Link ADD COLUMN actionId INTEGER REFERENCES Action(id) ON DELETE CASCADE;
