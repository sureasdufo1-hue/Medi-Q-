import { Module } from "@nestjs/common";
import { IdentityContextModule } from "../identity/identity-context.module.js";
import { ConsentRequestService } from "./application/consent-request.service.js";
import { ConsentApprovalService } from "./application/consent-approval.service.js";
import { ConsentWithdrawalService } from "./application/consent-withdrawal.service.js";
import { ConsentRequestController } from "./presentation/consent-request.controller.js";
import { GrantIssueService } from "../grant/application/grant-issue.service.js";
import { GrantIssueController } from "../grant/presentation/grant-issue.controller.js";
import { GrantRevocationService } from "../grant/application/grant-revocation.service.js";
import { GrantRevocationController } from "../grant/presentation/grant-revocation.controller.js";

@Module({
  imports: [IdentityContextModule],
  controllers: [ConsentRequestController, GrantIssueController, GrantRevocationController],
  providers: [ConsentRequestService, ConsentApprovalService, ConsentWithdrawalService, GrantIssueService, GrantRevocationService],
})
export class ConsentModule {}
