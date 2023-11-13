'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { sql } from '@vercel/postgres'

import { signIn } from '@/auth'

const InvoiceSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Amount must be greater than 0.' }),
  status: z.enum(['paid', 'pending'], {
    invalid_type_error: 'Please select a status.',
  }),
  date: z.string(),
})

const CreateInvoice = InvoiceSchema.omit({ id: true, date: true })

export type State = {
  errors?: {
    customerId?: string[]
    amount?: string[]
    status?: string[]
  }
  message?: string | null
}

export async function createInvoice(prevState: State, formData: FormData) {
  // Validate form data using Zod
  const validatedFields = CreateInvoice.safeParse(
    Object.fromEntries(formData.entries())
  )

  // If validation fails, return the errors
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    }
  }

  // Prepare the data for insertion into the database
  const { customerId, amount, status } = validatedFields.data
  const amountInCents = amount * 100
  const date = new Date().toISOString().split('T')[0]

  // Insert the data into the database
  try {
    await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
  `
  } catch (error) {
    // If the database insert fails, return a more specific error message
    return {
      message: 'Database Error: Failed to create invoice.',
    }
  }
  // Revalidate the cache for the invoices page and redirect the user to the list of invoices
  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

const UpdateInvoice = InvoiceSchema.omit({ date: true, id: true })

export async function updateInvoice(
  id: string | undefined,
  formData: FormData
) {
  if (!id) {
    return { message: 'Invoice ID is required.' }
  }

  const { customerId, amount, status } = UpdateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  })

  const amountInCents = amount * 100

  try {
    await sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
  `
  } catch (error) {
    return { message: 'Database Error: Failed to update invoice.' }
  }
  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

export async function deleteInvoice(id: string) {
  // Uncomment the line below to test the error message
  // throw new Error('Failed to Delete Invoice')
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`
    revalidatePath('/dashboard/invoices')
    return { message: 'Invoice deleted.' }
  } catch (error) {
    return { message: 'Database Error: Failed to delete invoice.' }
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn('credentials', Object.fromEntries(formData))
  } catch (error) {
    if ((error as Error).message.includes('CredentialsSignin')) {
      return 'CredentialSignin'
    }
    throw error
  }
}
