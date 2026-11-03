SELECT json_object(
  'schema', 'survey-aggregate-export/1',
  'captured_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'complete_snapshot', json('true'),
  'rows', json_group_array(json_object(
    'metric_key', metric_key,
    'count', CAST(count AS TEXT)
  ))
) AS export_json
FROM survey_aggregates;
