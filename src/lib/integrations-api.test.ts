import { describe, it, expect, vi } from 'vitest'
import { discoverIntegrations, policyBuilder } from './integrations-api'
import * as dmsApi from './dms-api'

describe('integrations-api', () => {
  describe('discoverIntegrations', () => {
    it('should discover AWS IoT Core integrations from RA metadata', async () => {
      const mockRAs = [
        {
          id: 'ra-1',
          name: 'Production RA',
          metadata: {
            'lamassu.io/iot/aws.region': 'us-east-1',
            'lamassu.io/iot/aws.account-id': '123456789012',
            'other-key': 'other-value',
          },
        },
      ]

      vi.spyOn(dmsApi, 'fetchAllRegistrationAuthorities').mockResolvedValue(mockRAs as any)

      const result = await discoverIntegrations()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'ra-1-lamassu.io/iot/aws.region',
        raId: 'ra-1',
        raName: 'Production RA',
        type: 'AWS_IOT_CORE',
        typeName: 'AWS IoT Core',
        configKey: 'lamassu.io/iot/aws.region',
        config: 'us-east-1',
      })
      expect(result[1]).toEqual({
        id: 'ra-1-lamassu.io/iot/aws.account-id',
        raId: 'ra-1',
        raName: 'Production RA',
        type: 'AWS_IOT_CORE',
        typeName: 'AWS IoT Core',
        configKey: 'lamassu.io/iot/aws.account-id',
        config: '123456789012',
      })
    })

    it('should discover unknown IoT integrations', async () => {
      const mockRAs = [
        {
          id: 'ra-2',
          name: 'Test RA',
          metadata: {
            'lamassu.io/iot/custom.setting': 'custom-value',
          },
        },
      ]

      vi.spyOn(dmsApi, 'fetchAllRegistrationAuthorities').mockResolvedValue(mockRAs as any)

      const result = await discoverIntegrations()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'ra-2-lamassu.io/iot/custom.setting',
        raId: 'ra-2',
        raName: 'Test RA',
        type: 'UNKNOWN',
        typeName: 'Unknown IoT Platform',
        configKey: 'lamassu.io/iot/custom.setting',
        config: 'custom-value',
      })
    })

    it('should handle multiple RAs with integrations', async () => {
      const mockRAs = [
        {
          id: 'ra-1',
          name: 'RA One',
          metadata: {
            'lamassu.io/iot/aws.region': 'eu-west-1',
          },
        },
        {
          id: 'ra-2',
          name: 'RA Two',
          metadata: {
            'lamassu.io/iot/aws.endpoint': 'https://example.aws.com',
          },
        },
      ]

      vi.spyOn(dmsApi, 'fetchAllRegistrationAuthorities').mockResolvedValue(mockRAs as any)

      const result = await discoverIntegrations()

      expect(result).toHaveLength(2)
      expect(result[0].raId).toBe('ra-1')
      expect(result[1].raId).toBe('ra-2')
    })

    it('should ignore non-IoT metadata keys', async () => {
      const mockRAs = [
        {
          id: 'ra-1',
          name: 'Test RA',
          metadata: {
            'lamassu.io/iot/aws.region': 'us-west-2',
            'regular-metadata-key': 'value',
            'another-key': 'another-value',
          },
        },
      ]

      vi.spyOn(dmsApi, 'fetchAllRegistrationAuthorities').mockResolvedValue(mockRAs as any)

      const result = await discoverIntegrations()

      expect(result).toHaveLength(1)
      expect(result[0].configKey).toBe('lamassu.io/iot/aws.region')
    })

    it('should handle RAs without metadata', async () => {
      const mockRAs = [
        {
          id: 'ra-1',
          name: 'RA Without Metadata',
        },
        {
          id: 'ra-2',
          name: 'RA With Empty Metadata',
          metadata: {},
        },
      ]

      vi.spyOn(dmsApi, 'fetchAllRegistrationAuthorities').mockResolvedValue(mockRAs as any)

      const result = await discoverIntegrations()

      expect(result).toHaveLength(0)
    })

    it('should handle empty RA list', async () => {
      vi.spyOn(dmsApi, 'fetchAllRegistrationAuthorities').mockResolvedValue([])

      const result = await discoverIntegrations()

      expect(result).toHaveLength(0)
      expect(result).toEqual([])
    })

    it('should generate unique IDs for integrations', async () => {
      const mockRAs = [
        {
          id: 'ra-1',
          name: 'Test RA',
          metadata: {
            'lamassu.io/iot/aws.region': 'us-east-1',
            'lamassu.io/iot/aws.endpoint': 'https://example.com',
          },
        },
      ]

      vi.spyOn(dmsApi, 'fetchAllRegistrationAuthorities').mockResolvedValue(mockRAs as any)

      const result = await discoverIntegrations()

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('ra-1-lamassu.io/iot/aws.region')
      expect(result[1].id).toBe('ra-1-lamassu.io/iot/aws.endpoint')
      expect(result[0].id).not.toBe(result[1].id)
    })

    it('should handle complex metadata values', async () => {
      const mockRAs = [
        {
          id: 'ra-1',
          name: 'Test RA',
          metadata: {
            'lamassu.io/iot/aws.config': {
              region: 'us-east-1',
              accountId: '123456789012',
              nested: { value: 'test' },
            },
          },
        },
      ]

      vi.spyOn(dmsApi, 'fetchAllRegistrationAuthorities').mockResolvedValue(mockRAs as any)

      const result = await discoverIntegrations()

      expect(result).toHaveLength(1)
      expect(result[0].config).toEqual({
        region: 'us-east-1',
        accountId: '123456789012',
        nested: { value: 'test' },
      })
    })
  })

  describe('policyBuilder', () => {
    it('should build AWS IoT policy without shadow name', () => {
      const accountId = '123456789012'
      const shadowName = ''

      const policy = policyBuilder(accountId, shadowName)

      expect(policy).toContain(accountId)
      expect(policy).toContain('"Version": "2012-10-17"')
      expect(policy).toContain('"Effect": "Allow"')
      expect(policy).toContain('iot:Connect')
      expect(policy).toContain('iot:Publish')
      expect(policy).toContain('iot:Subscribe')
      expect(policy).toContain('iot:Receive')
      expect(policy).not.toContain('ACCOUNTID')
      expect(policy).not.toContain('SHADOWID')
    })

    it('should build AWS IoT policy with shadow name', () => {
      const accountId = '987654321098'
      const shadowName = 'device-shadow'

      const policy = policyBuilder(accountId, shadowName)

      expect(policy).toContain(accountId)
      expect(policy).toContain('name/device-shadow/')
      expect(policy).not.toContain('ACCOUNTID')
      expect(policy).not.toContain('SHADOWID')
    })

    it('should replace all ACCOUNTID placeholders', () => {
      const accountId = '111111111111'
      const shadowName = ''

      const policy = policyBuilder(accountId, shadowName)
      const parsed = JSON.parse(policy)

      // Check that all ARNs contain the account ID
      const allResources: string[] = []
      for (const statement of parsed.Statement) {
        allResources.push(...statement.Resource)
      }

      for (const resource of allResources) {
        if (resource.includes('arn:aws:iot')) {
          expect(resource).toContain(accountId)
          expect(resource).not.toContain('ACCOUNTID')
        }
      }
    })

    it('should include correct IAM policy structure', () => {
      const accountId = '123456789012'
      const shadowName = 'test-shadow'

      const policy = policyBuilder(accountId, shadowName)
      const parsed = JSON.parse(policy)

      expect(parsed).toHaveProperty('Version')
      expect(parsed.Version).toBe('2012-10-17')
      expect(parsed).toHaveProperty('Statement')
      expect(Array.isArray(parsed.Statement)).toBe(true)
      expect(parsed.Statement.length).toBe(4)
    })

    it('should include Connect action with correct resource', () => {
      const accountId = '123456789012'
      const shadowName = ''

      const policy = policyBuilder(accountId, shadowName)
      const parsed = JSON.parse(policy)

      const connectStatement = parsed.Statement.find((s: any) =>
        s.Action.includes('iot:Connect')
      )

      expect(connectStatement).toBeDefined()
      expect(connectStatement.Effect).toBe('Allow')
      expect(connectStatement.Resource).toHaveLength(1)
      expect(connectStatement.Resource[0]).toContain('client/')
      expect(connectStatement.Resource[0]).toContain('${iot:Connection.Thing.ThingName}')
    })

    it('should include Publish action with correct resources', () => {
      const accountId = '123456789012'
      const shadowName = 'my-shadow'

      const policy = policyBuilder(accountId, shadowName)
      const parsed = JSON.parse(policy)

      const publishStatement = parsed.Statement.find((s: any) =>
        s.Action.includes('iot:Publish')
      )

      expect(publishStatement).toBeDefined()
      expect(publishStatement.Resource).toHaveLength(2)
      expect(publishStatement.Resource[0]).toContain('topic/$aws/things/')
      expect(publishStatement.Resource[1]).toContain('shadow/name/my-shadow/')
    })

    it('should include Subscribe action with correct resources', () => {
      const accountId = '123456789012'
      const shadowName = ''

      const policy = policyBuilder(accountId, shadowName)
      const parsed = JSON.parse(policy)

      const subscribeStatement = parsed.Statement.find((s: any) =>
        s.Action.includes('iot:Subscribe')
      )

      expect(subscribeStatement).toBeDefined()
      expect(subscribeStatement.Resource).toHaveLength(2)
      expect(subscribeStatement.Resource[0]).toContain('topicfilter/')
    })

    it('should include Receive action with correct resources', () => {
      const accountId = '123456789012'
      const shadowName = ''

      const policy = policyBuilder(accountId, shadowName)
      const parsed = JSON.parse(policy)

      const receiveStatement = parsed.Statement.find((s: any) =>
        s.Action.includes('iot:Receive')
      )

      expect(receiveStatement).toBeDefined()
      expect(receiveStatement.Resource).toHaveLength(2)
    })

    it('should produce valid JSON', () => {
      const accountId = '123456789012'
      const shadowName = 'test'

      const policy = policyBuilder(accountId, shadowName)

      expect(() => JSON.parse(policy)).not.toThrow()
    })

    it('should format JSON with proper indentation', () => {
      const accountId = '123456789012'
      const shadowName = ''

      const policy = policyBuilder(accountId, shadowName)

      // Check that it's pretty-printed (has newlines and spaces)
      expect(policy).toContain('  ')
      expect(policy).toContain('\n')
    })

    it('should handle empty shadow name by not including name prefix', () => {
      const accountId = '123456789012'
      const shadowName = ''

      const policy = policyBuilder(accountId, shadowName)
      const parsed = JSON.parse(policy)

      const publishStatement = parsed.Statement.find((s: any) =>
        s.Action.includes('iot:Publish')
      )

      // Shadow resource should not have the "name/" prefix
      const shadowResource = publishStatement.Resource.find((r: string) =>
        r.includes('shadow/')
      )
      expect(shadowResource).not.toContain('name/')
      expect(shadowResource).toContain('shadow/*')
    })

    it('should use eu-west-1 region in all ARNs', () => {
      const accountId = '123456789012'
      const shadowName = ''

      const policy = policyBuilder(accountId, shadowName)
      const parsed = JSON.parse(policy)

      const allResources: string[] = []
      for (const statement of parsed.Statement) {
        allResources.push(...statement.Resource)
      }

      for (const resource of allResources) {
        if (resource.includes('arn:aws:iot')) {
          expect(resource).toContain('eu-west-1')
        }
      }
    })
  })
})
