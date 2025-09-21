import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export default function InvitationEmail({
  link,
  inviter,
  organizationName,
  user = 'User',
  app = 'Cared',
  logo = 'https://cared.dev/logo.png',
  supportEmail = 'support@cared.dev',
}: {
  link: string
  inviter: string
  organizationName: string
  user?: string
  app?: string
  logo?: string
  supportEmail?: string
}) {
  if (!link) {
    link = 'https://cared.dev/accept-invitation'
  }
  if (!inviter) {
    inviter = 'Jason'
  }
  if (!organizationName) {
    organizationName = 'Tavern'
  }

  return (
    <Html>
      <Head>
        <title>You've Been Invited to Join [{organizationName}]</title>
        <meta
          name="description"
          content={`${inviter} has invited you to join ${organizationName}`}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Preview>{`${inviter} has invited you to join ${organizationName}`}</Preview>

      <Body style={main}>
        <Container style={container}>
          {/* Header with Logo */}
          <Section style={header}>
            <Img src={logo} width="120" height="40" alt={app} style={logoImage} />
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Heading style={h1}>You've Been Invited to Join [{organizationName}]</Heading>

            <Text style={text}>Hi {user},</Text>

            <Text style={text}>
              {inviter} has invited you to join {organizationName} on {app}. You'll be able to
              collaborate with your team, access shared resources, and participate in organizational
              activities.
            </Text>

            {/* Organization Info */}
            <Section style={orgInfoContainer}>
              <Text style={orgInfoTitle}>Organization Details</Text>
              <Text style={orgInfoText}>
                <strong>Name:</strong> {organizationName}
              </Text>
              <Text style={orgInfoText}>
                <strong>Invited by:</strong> {inviter}
              </Text>
            </Section>

            {/* Accept Button */}
            <Section style={buttonContainer}>
              <Button href={link} style={button} className="button">
                Accept Invitation
              </Button>
            </Section>

            {/* Alternative Link */}
            <Text style={text}>
              If the button above doesn't work, you can also copy and paste this link into your
              browser:
            </Text>

            <Text style={linkText}>
              <Link href={link} style={linkStyle}>
                {link}
              </Link>
            </Text>

            {/* Security Notice */}
            <Section style={noticeContainer}>
              <Text style={noticeText}>
                <strong>Security Notice:</strong> This invitation link will expire in 24 hours for
                your security. If you didn't expect this invitation from {inviter}, you can safely
                ignore this email.
              </Text>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Need help? Contact us at{' '}
              <Link href={`mailto:${supportEmail}`} style={footerLink}>
                {supportEmail}
              </Link>
            </Text>

            <Text style={footerText}>
              © {new Date().getFullYear()} {app}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: 0,
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
}

const header = {
  textAlign: 'center' as const,
  padding: '32px 0',
  borderBottom: '1px solid #e6ebf1',
}

const logoImage = {
  margin: '0 auto',
}

const content = {
  padding: '32px 24px',
}

const h1 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0 0 24px 0',
  textAlign: 'center' as const,
}

const text = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px 0',
}

const orgInfoContainer = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
}

const orgInfoTitle = {
  color: '#1f2937',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 16px 0',
}

const orgInfoText = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0 0 8px 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#374151',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
  border: 'none',
  cursor: 'pointer',
}

const linkText = {
  wordBreak: 'break-all' as const,
  margin: '16px 0',
}

const linkStyle = {
  color: '#3b82f6',
  textDecoration: 'underline',
}

const noticeContainer = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
}

const noticeText = {
  color: '#92400e',
  fontSize: '14px',
  lineHeight: '20px',
  margin: 0,
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
}

const footer = {
  padding: '24px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0 0 8px 0',
}

const footerLink = {
  color: '#3b82f6',
  textDecoration: 'none',
}
