# MediQ Synthetic Health Data Fixtures

이 디렉터리는 Capstone 건강정보 연계 Preview에 사용하는 결정론적 합성 Fixture를 보관한다.

## Fixture

- `mediq-health-preview-fixture-v1.1.json`: 건강검진, 일반 혈액검사, 항체검사의 합성 예시

## 안전 경계

- `TEST-*`, `SYNTHETIC`, `MOCK` Marker를 제거하지 않는다.
- 실제 환자정보, 실제 병원 환자번호·OID, 운영 API 응답을 혼합하지 않는다.
- 값과 참고범위는 UI 시연용이며 진료·진단·면역 판정에 사용하지 않는다.
- 실제 기관으로 Outbound Call하거나 의료진 공유·PACS Import에 전달하지 않는다.
- 정식 기준은 `docs/SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다.
