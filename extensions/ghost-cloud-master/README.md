# Ghost Cloud-Master

AI-powered infrastructure-as-code generator and cloud auditing assistant for the Ghost CLI ecosystem.

## Phase 3: Cloud Security & Cost Audit (Completed)
This final phase added deep auditing capabilities for existing IaC files.

### New Features
- **Security Vulnerability Detection**: Identifies misconfigurations like public S3 buckets or open SSH ports.
- **AI Cost Estimation**: Leverages AI to provide a monthly cost breakdown for defined cloud resources.
- **Compliance Scanning**: Audits Terraform and CloudFormation files against security best practices.

### New Commands
- `ghost cloud audit [path]`: Scans IaC files for security risks and cost insights.

## Installation
```bash
ghost marketplace install ghost-cloud-master
```
