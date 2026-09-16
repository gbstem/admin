declare namespace Cypress {
  interface Chainable<_Subject = any> {
    signedInSession(
      role: 'admin' | 'instructor' | 'reviewer' | 'student',
      options?: {
        email?: string
        initialPage?: string
      },
    ): Chainable<any>
    signOutViaUi(): Chainable<any>
    fillInput(selector: string, text: string): Chainable<any>
    setFieldValue(selector: string, value: string): Chainable<any>
    submitSearch(term: string): Chainable<any>
    selectOption(
      selector: string,
      text: string,
      options?: Partial<Cypress.Timeoutable>,
    ): Chainable<any>
    waitForFormHydration(selector?: string): Chainable<any>
    parseCsv(csvText: string): Chainable<string[][]>
    parseCopiedEmails(clipboardText: string): Chainable<string[]>
    dropCsvColumn(
      parsedRows: string[][],
      columnName: string,
    ): Chainable<string[][]>
    getLatestOobLink(
      email: string,
      requestType:
        'VERIFY_EMAIL' | 'PASSWORD_RESET' | 'VERIFY_AND_CHANGE_EMAIL',
    ): Chainable<string>
    clearTestEmails(): Chainable<any>
    verifyEmailSent(
      email: string,
      subjectSubstring: string,
      timeoutMs?: number,
    ): Chainable<any>
    waitForNotification(
      text: string,
      colorClass?: string,
      timeoutMs?: number,
    ): Chainable<any>
    setInterviewSlot(slot: {
      collectionPath: string
      id: string
      date: string
      interviewerName: string
      interviewerUid?: string
      meetingLink: string
      semester?: string
      intervieweeId?: string
    }): Chainable<any>
    createTestToken(
      id: string,
      options?: {
        role?: string
        consumable?: boolean
        consumers?: string[]
        expiresAt?: string
      },
    ): Chainable<any>
    getFirebaseAuthToken(): Chainable<string>
    getFirestoreUserId(authToken: string, email: string): Chainable<string>
    getFirestoreDoc(
      authToken: string,
      collection: string,
      docId: string,
    ): Chainable<any>
    captureConfirms(answer?: boolean | (() => boolean)): Chainable<string[]>
  }
}
