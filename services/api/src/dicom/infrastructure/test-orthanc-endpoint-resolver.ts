import type { AppConfig } from "../../config/app-config.js";
import type {
  DicomGatewayOperation,
  DicomGatewayRequestContext,
} from "../application/dicom-gateway.port.js";

export const TEST_HOSPITAL_A_ID = "04000000-0000-4000-8000-000000000001";
export const TEST_HOSPITAL_B_ID = "04000000-0000-4000-8000-000000000002";

export interface ResolvedDicomEndpoint {
  readonly origin: URL;
  readonly authorization: string;
}

export interface DicomEndpointResolver {
  resolve(
    context: DicomGatewayRequestContext,
    operation: DicomGatewayOperation,
  ): ResolvedDicomEndpoint;
}

type EndpointConfig = {
  readonly origin: string;
  readonly username: string;
  readonly password: string;
  readonly operations: ReadonlySet<DicomGatewayOperation>;
  readonly hostname: "orthanc-a" | "orthanc-b";
};

/**
 * Local synthetic-only endpoint resolver. It intentionally does not read
 * hospital_endpoints at runtime: this adapter has no verified Tenant DB
 * context and is not wired to a protected application operation.
 */
export class TestOrthancEndpointResolver implements DicomEndpointResolver {
  readonly #endpoints: ReadonlyMap<string, EndpointConfig>;

  constructor(config: AppConfig) {
    if (
      config.runtimeProfile !== "container" ||
      (config.environment !== "development" && config.environment !== "test")
    ) {
      throw new Error("DICOM_CONFIGURATION_DENIED");
    }

    this.#endpoints = new Map([
      [
        TEST_HOSPITAL_A_ID,
        {
          origin: config.orthancAUrl,
          username: config.orthancAUsername,
          password: config.orthancAPassword,
          hostname: "orthanc-a",
          operations: new Set<DicomGatewayOperation>([
            "QIDO_STUDIES",
            "WADO_STUDY_METADATA",
            "WADO_INSTANCE",
            "WADO_FRAME",
          ]),
        },
      ],
      [
        TEST_HOSPITAL_B_ID,
        {
          origin: config.orthancBUrl,
          username: config.orthancBUsername,
          password: config.orthancBPassword,
          hostname: "orthanc-b",
          operations: new Set<DicomGatewayOperation>([
            "QIDO_STUDIES",
            "STOW_INSTANCE",
            "VERIFY_STUDY",
          ]),
        },
      ],
    ]);
  }

  resolve(
    context: DicomGatewayRequestContext,
    operation: DicomGatewayOperation,
  ): ResolvedDicomEndpoint {
    validateContext(context);
    const endpoint = this.#endpoints.get(context.hospitalId);
    if (!endpoint || !endpoint.operations.has(operation)) {
      throw new Error("DICOM_ENDPOINT_DENIED");
    }

    let url: URL;
    try {
      url = new URL(endpoint.origin);
    } catch {
      throw new Error("DICOM_CONFIGURATION_INVALID");
    }
    const expectedHost = endpoint.hostname;
    const effectivePort = url.port ? Number(url.port) : 443;
    if (
      url.protocol !== "https:" ||
      url.hostname !== expectedHost ||
      effectivePort !== 8042 ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash ||
      !endpoint.username ||
      !endpoint.password
    ) {
      throw new Error("DICOM_CONFIGURATION_INVALID");
    }

    return {
      origin: new URL("https://" + expectedHost + ":8042/dicom-web/"),
      authorization:
        "Basic " +
        Buffer.from(`${endpoint.username}:${endpoint.password}`, "utf8").toString(
          "base64",
        ),
    };
  }
}

export function validateContext(context: DicomGatewayRequestContext): void {
  if (
    !context ||
    typeof context.hospitalId !== "string" ||
    typeof context.correlationId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(context.correlationId) ||
    !(context.signal instanceof AbortSignal)
  ) {
    throw new Error("DICOM_CONTEXT_INVALID");
  }
}
