UPDATE review_skills
SET sort_order = CASE key
  WHEN 'architecture' THEN 10
  WHEN 'security' THEN 20
  WHEN 'tests' THEN 30
  WHEN 'documentation' THEN 40
  ELSE sort_order
END
WHERE key IN ('architecture', 'security', 'tests', 'documentation');
