GRANT SELECT (integrity_id, operation_id, exchange_session_id, package_id,
  study_ref_id, verification_stage, algorithm, source_digest,
  source_object_count, status, verified_at, created_at)
  ON TABLE integrity_evidence TO mediq_runtime;

GRANT INSERT (integrity_id, operation_id, exchange_session_id, package_id,
  study_ref_id, verification_stage, algorithm, source_digest,
  source_object_count, status, verified_at, created_at)
  ON TABLE integrity_evidence TO mediq_runtime;

GRANT SELECT (study_instance_uid, series_count, instance_count)
  ON TABLE study_references TO mediq_runtime;
