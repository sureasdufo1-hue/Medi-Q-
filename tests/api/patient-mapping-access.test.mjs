import { describe, expect, it, vi } from "vitest";
import {
  PatientMappingAccessDeniedError,
  PatientMappingAccessService,
  PatientMappingAccessUnavailableError,
} from "../../services/api/dist/patient/application/patient-mapping-access.service.js";
import { PatientMapping } from "../../services/api/dist/patient/domain/patient-mapping.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
} from "../../services/api/dist/identity/identity-context.types.js";

const tenantA = "02000000-0000-4000-8000-000000000001";
const hospitalA = "04000000-0000-4000-8000-000000000001";
const hospitalB = "04000000-0000-4000-8000-000000000002";
const mappingId = "23000000-0000-4000-8000-000000000001";
const fixedNow = new Date("2026-09-30T00:00:00.000Z");
const principal = Object.freeze({
  issuer: "https://identity.example.test/issuer",
  subject: "synthetic-pat002-user",
});
const identity = Object.freeze({
  issuer: principal.issuer,
  subject: principal.subject,
  actorId: "03000000-0000-4000-8000-000000000001",
  tenantId: tenantA,
  hospitalId: hospitalA,
  actorType: "USER",
});
const client = { query: vi.fn(), release: vi.fn() };
const mapping = PatientMapping.reconstitute({
  mappingId,
  patientRefId: "22000000-0000-4000-8000-000000000001",
  hospitalId: hospitalA,
  localPatientId: "TEST-A-001",
  status: "UNVERIFIED",
  validatedAt: null,
  createdAt: fixedNow,
  updatedAt: fixedNow,
});

function setup({ currentIdentity = identity, runError, result = mapping } = {}) {
  const repository = {
    findByIdForHospital: vi.fn().mockResolvedValue(result),
  };
  const repositoryFactory = vi.fn(() => repository);
  const run = vi.fn(async (_principal, _tenant, work) => {
    if (runError) throw runError;
    return work(currentIdentity, client);
  });
  return {
    service: new PatientMappingAccessService({ run }, repositoryFactory),
    run,
    repository,
    repositoryFactory,
  };
}

describe("PatientMappingAccessService", () => {
  it("reads only after exact verified Hospital match, using the same transaction client", async () => {
    const subject = setup();

    await expect(
      subject.service.findById(principal, tenantA, hospitalA, mappingId),
    ).resolves.toBe(mapping);

    expect(subject.run).toHaveBeenCalledTimes(1);
    expect(subject.repositoryFactory).toHaveBeenCalledTimes(1);
    expect(subject.repositoryFactory).toHaveBeenCalledWith(client);
    expect(subject.repository.findByIdForHospital).toHaveBeenCalledOnce();
    expect(subject.repository.findByIdForHospital).toHaveBeenCalledWith(
      hospitalA,
      mappingId,
    );
  });

  it("denies a same-Tenant different-Hospital request before repository creation", async () => {
    const subject = setup();

    await expect(
      subject.service.findById(principal, tenantA, hospitalB, mappingId),
    ).rejects.toBeInstanceOf(PatientMappingAccessDeniedError);

    expect(subject.repositoryFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["SERVICE Actor", { actorType: "SERVICE" }],
    ["Hospital-less Actor", { hospitalId: null }],
    ["malformed Actor identity", { actorId: "bad-actor-id" }],
    ["malformed Tenant identity", { tenantId: "bad-tenant-id" }],
  ])("denies %s before repository creation", async (_label, changes) => {
    const subject = setup({
      currentIdentity: Object.freeze({ ...identity, ...changes }),
    });

    await expect(
      subject.service.findById(principal, tenantA, hospitalA, mappingId),
    ).rejects.toBeInstanceOf(PatientMappingAccessDeniedError);

    expect(subject.repositoryFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed requested Hospital", "not-a-uuid", mappingId],
    ["malformed mapping identifier", hospitalA, "not-a-uuid"],
  ])("rejects %s before identity lookup", async (_label, target, id) => {
    const subject = setup();

    await expect(
      subject.service.findById(principal, tenantA, target, id),
    ).rejects.toBeInstanceOf(PatientMappingAccessDeniedError);

    expect(subject.run).not.toHaveBeenCalled();
    expect(subject.repositoryFactory).not.toHaveBeenCalled();
  });

  it("maps denied and unavailable identity context to fixed errors", async () => {
    const denied = setup({ runError: new ActorTenantContextDeniedError() });
    const unavailable = setup({
      runError: new ActorTenantContextUnavailableError(),
    });

    await expect(
      denied.service.findById(principal, tenantA, hospitalA, mappingId),
    ).rejects.toBeInstanceOf(PatientMappingAccessDeniedError);
    await expect(
      unavailable.service.findById(principal, tenantA, hospitalA, mappingId),
    ).rejects.toMatchObject({
      constructor: PatientMappingAccessUnavailableError,
      message: "PATIENT_MAPPING_ACCESS_UNAVAILABLE",
    });
    expect(denied.repositoryFactory).not.toHaveBeenCalled();
    expect(unavailable.repositoryFactory).not.toHaveBeenCalled();
  });

  it("hides repository and database failure details", async () => {
    const subject = setup();
    subject.repository.findByIdForHospital.mockRejectedValue(
      new Error("secret local-patient database detail"),
    );

    const error = await subject.service
      .findById(principal, tenantA, hospitalA, mappingId)
      .catch((failure) => failure);

    expect(error).toBeInstanceOf(PatientMappingAccessUnavailableError);
    expect(error.message).toBe("PATIENT_MAPPING_ACCESS_UNAVAILABLE");
    expect(error.message).not.toContain("secret");
    expect(error.message).not.toContain("local-patient");
  });
});
