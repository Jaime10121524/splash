import React from 'react'

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g,'').slice(0,11)
}

export function formatPhone(value) {
  const digits=phoneDigits(value)
  if (!digits) return ''
  if (digits.length < 3) return '('+digits
  const ddd='('+digits.slice(0,2)+') '
  const body=digits.slice(2)
  if (digits.length <= 6) return ddd+body
  const mobile=digits.length > 10
  const prefix=mobile?5:4
  if (body.length <= prefix) return ddd+body
  return ddd+body.slice(0,prefix)+'-'+body.slice(prefix)
}

export default function PhoneInput({value='',onChange,required=false,disabled=false,...props}) {
  return <input type="tel" inputMode="tel" autoComplete="tel"
    maxLength={15} required={required} disabled={disabled}
    value={formatPhone(value)}
    onChange={event=>onChange(phoneDigits(event.target.value))}
    {...props}/>
}
