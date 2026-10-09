import { jest, describe, it, expect, beforeEach } from '@jest/globals'

describe('email service', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('sends email when token is set', async () => {
    jest.doMock(
      '$app/env/private',
      () => ({
        SENDGRID_API_TOKEN: 'test-token',
      }),
      { virtual: true },
    )

    const { sendEmail } = await import('../src/lib/server/email')
    const MailService = (await import('@sendgrid/mail')).default

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await sendEmail({
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
      cc: 'cc@example.com',
      replyTo: 'reply@example.com',
    })

    expect(MailService.setApiKey).toHaveBeenCalledWith('test-token')
    expect(MailService.send).toHaveBeenCalledWith({
      from: 'donotreply@gbstem.org',
      to: ['test@example.com'],
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
      cc: ['cc@example.com'],
      replyTo: 'reply@example.com',
    })
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Email sent to: test@example.com | Subject: Test Subject',
      ),
    )
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('sends email when to and cc are arrays', async () => {
    jest.doMock(
      '$app/env/private',
      () => ({
        SENDGRID_API_TOKEN: 'test-token',
      }),
      { virtual: true },
    )

    const { sendEmail } = await import('../src/lib/server/email')
    const MailService = (await import('@sendgrid/mail')).default

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await sendEmail({
      to: ['test1@example.com', 'test2@example.com'],
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
      cc: ['cc1@example.com', 'cc2@example.com'],
    })

    expect(MailService.setApiKey).toHaveBeenCalledWith('test-token')
    expect(MailService.send).toHaveBeenCalledWith({
      from: 'donotreply@gbstem.org',
      to: ['test1@example.com', 'test2@example.com'],
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
      cc: ['cc1@example.com', 'cc2@example.com'],
      replyTo: 'contact@gbstem.org',
    })
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Email sent to: test1@example.com, test2@example.com | Subject: Test Subject',
      ),
    )
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('parses and trims comma-separated string emails into arrays', async () => {
    jest.doMock(
      '$app/env/private',
      () => ({
        SENDGRID_API_TOKEN: 'test-token',
      }),
      { virtual: true },
    )

    const { sendEmail } = await import('../src/lib/server/email')
    const MailService = (await import('@sendgrid/mail')).default

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await sendEmail({
      to: ' test1@example.com , test2@example.com ',
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
      cc: ' cc1@example.com , cc2@example.com ',
    })

    expect(MailService.setApiKey).toHaveBeenCalledWith('test-token')
    expect(MailService.send).toHaveBeenCalledWith({
      from: 'donotreply@gbstem.org',
      to: ['test1@example.com', 'test2@example.com'],
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
      cc: ['cc1@example.com', 'cc2@example.com'],
      replyTo: 'contact@gbstem.org',
    })
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Email sent to: test1@example.com, test2@example.com | Subject: Test Subject',
      ),
    )
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('simulates email when token is not set', async () => {
    jest.doMock(
      '$app/env/private',
      () => ({
        SENDGRID_API_TOKEN: '',
      }),
      { virtual: true },
    )

    const { sendEmail } = await import('../src/lib/server/email')
    const MailService = (await import('@sendgrid/mail')).default

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await sendEmail({
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
    })

    expect(MailService.setApiKey).not.toHaveBeenCalled()
    expect(MailService.send).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "SENDGRID_API_TOKEN isn't set. Email sends are simulated.",
      ),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Email sent to: test@example.com | Subject: Test Subject',
      ),
    )

    warnSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('simulates email when token is set to the placeholder', async () => {
    jest.doMock(
      '$app/env/private',
      () => ({
        SENDGRID_API_TOKEN:
          'SG.abcdefghijklmnopqrstuvwxyz.1234567890abcdefghijklmnopqrstuvwxyz',
      }),
      { virtual: true },
    )

    const { sendEmail } = await import('../src/lib/server/email')
    const MailService = (await import('@sendgrid/mail')).default

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await sendEmail({
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
    })

    expect(MailService.setApiKey).not.toHaveBeenCalled()
    expect(MailService.send).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "SENDGRID_API_TOKEN isn't set. Email sends are simulated.",
      ),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Email sent to: test@example.com | Subject: Test Subject',
      ),
    )

    warnSpy.mockRestore()
    logSpy.mockRestore()
  })
})
