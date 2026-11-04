// Bank and investing sign-up bonuses, each checked on 2026-10-29 on the institution's own offer page (verified
// "institution") or, where that page wouldn't load, a deal-tracking site ("tracker": Doctor of Credit, MoneySavingExpert).
// Offers change weekly: re-check before relying on one. Expired ones drop out on their own (matchOffer).
// ponytail: a hand-kept list; refresh it every couple of weeks until there's a feed.
import type { Offer } from "./bonuses.ts";

export const OFFERS: Offer[] = [
  {
    "id": "chase-total-checking-900",
    "country": "US",
    "kind": "checking",
    "institution": "Chase",
    "product": "Chase Total Checking",
    "bonus": 900,
    "requirement": "Open Chase Total Checking with the offer and receive direct deposits totaling $2,500 / $5,000 / $10,000 within 90 days of enrolling.",
    "directDeposit": 10000,
    "depositWithinDays": 90,
    "switch": false,
    "monthlyFee": 15,
    "feeWaiver": "$500+ monthly direct deposits, or $1,500 daily balance, or $5,000 average balance across linked Chase accounts. Not charged for the first two statement periods.",
    "earlyCloseFee": 0,
    "expires": "2027-01-27",
    "excludes": "Not if you have a Chase checking account, closed one in the last 90 days, or closed one with a negative balance in the last 3 years. One new checking bonus every 2 years.",
    "creditPull": "soft",
    "url": "https://www.chase.com/personal/offers/checking-tier",
    "checked": "2026-10-29",
    "verified": "tracker",
    "notes": "Chase's own page did not render the terms. Same product as chase-total-checking-400; you can only get one.",
    "tiers": [
      {
        "bonus": 425,
        "requirement": "$2,500+ direct deposits in 90 days",
        "need": 2500
      },
      {
        "bonus": 600,
        "requirement": "$5,000+ direct deposits in 90 days",
        "need": 5000
      },
      {
        "bonus": 900,
        "requirement": "$10,000+ direct deposits in 90 days",
        "need": 10000
      }
    ],
    "newMoney": null,
    "holdDays": null
  },
  {
    "id": "chase-total-checking-400",
    "country": "US",
    "kind": "checking",
    "institution": "Chase",
    "product": "Chase Total Checking",
    "bonus": 400,
    "requirement": "Open Chase Total Checking with the offer and receive direct deposits totaling $1,000+ within 90 days of enrolling.",
    "directDeposit": 1000,
    "depositWithinDays": 90,
    "switch": false,
    "monthlyFee": 15,
    "feeWaiver": "$500+ electronic deposits, or $1,500+ beginning-of-day balance, or $5,000+ average beginning-day balance with linked accounts, or linking a qualifying checking account. Not charged for the first two statement periods.",
    "expires": "2027-01-27",
    "excludes": "Not if you have a Chase checking account, closed one in the last 90 days, or closed one with a negative balance in the last 3 years. One new checking bonus every 2 years.",
    "creditPull": "soft",
    "url": "https://account.chase.com/consumer/banking/seo",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Same product as chase-total-checking-900; you can only get one. creditPull from Doctor of Credit.",
    "newMoney": null,
    "holdDays": null
  },
  {
    "id": "us-bank-smartly-450",
    "country": "US",
    "kind": "checking",
    "institution": "U.S. Bank",
    "product": "U.S. Bank Smartly Checking",
    "bonus": 450,
    "requirement": "Open Smartly Checking from the offer page, get at least two direct deposits within 90 days totaling the tier amount, and enroll in mobile or online banking within 90 days.",
    "directDeposit": 8000,
    "depositWithinDays": 90,
    "switch": false,
    "monthlyFee": 12,
    "feeWaiver": "$1,500+ combined monthly direct deposits, or $1,500 average balance, or other options (Smart Rewards tier, eligible U.S. Bank card). Waived for the first two statement periods.",
    "expires": "2026-11-10",
    "excludes": "Not if you have or had a U.S. Bank consumer checking account in the last 12 months, or got a U.S. Bank checking bonus in the last 12 months.",
    "creditPull": "soft",
    "url": "https://www.usbank.com/splash/checking/2026-all-market-checking-offer.html",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "May not be available outside the U.S. Bank footprint. creditPull from Doctor of Credit.",
    "tiers": [
      {
        "bonus": 250,
        "requirement": "$2,000-$4,999.99 in direct deposits",
        "need": 2000
      },
      {
        "bonus": 350,
        "requirement": "$5,000-$7,999.99 in direct deposits",
        "need": 5000
      },
      {
        "bonus": 450,
        "requirement": "$8,000+ in direct deposits",
        "need": 8000
      }
    ],
    "newMoney": null,
    "holdDays": null
  },
  {
    "id": "bofa-advantage-500",
    "country": "US",
    "kind": "checking",
    "institution": "Bank of America",
    "product": "Advantage Plus / SafeBalance / Relationship Banking",
    "bonus": 500,
    "requirement": "Open an eligible Advantage checking account and receive qualifying direct deposits within 90 days of opening.",
    "directDeposit": 10000,
    "depositWithinDays": 90,
    "switch": false,
    "monthlyFee": 12,
    "feeWaiver": "Advantage Plus $12, waivable (including by direct deposit). SafeBalance $4.95 ($0 under 25). Relationship $25.",
    "expires": "2027-01-31",
    "excludes": "Not if you owned or co-owned a Bank of America personal checking account in the last 12 months. One bonus per customer.",
    "creditPull": "soft",
    "url": "https://promotions.bankofamerica.com/en/offers/chooseyourchecking500tiered",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Account must be open and in good standing when the bonus pays. creditPull from Doctor of Credit.",
    "tiers": [
      {
        "bonus": 100,
        "requirement": "$2,000-$4,999 in direct deposits",
        "need": 2000
      },
      {
        "bonus": 300,
        "requirement": "$5,000-$9,999 in direct deposits",
        "need": 5000
      },
      {
        "bonus": 500,
        "requirement": "$10,000+ in direct deposits",
        "need": 10000
      }
    ],
    "newMoney": null,
    "holdDays": null
  },
  {
    "id": "pnc-virtual-wallet-400",
    "country": "US",
    "kind": "checking",
    "institution": "PNC",
    "product": "Virtual Wallet with Performance Select / Virtual Wallet",
    "bonus": 400,
    "requirement": "Open a Virtual Wallet and receive qualifying direct deposits to the Spend account within 60 days.",
    "directDeposit": 5000,
    "depositWithinDays": 60,
    "switch": false,
    "monthlyFee": 25,
    "feeWaiver": "Performance Select $25, Virtual Wallet $7; both waivable (criteria not on the offer page).",
    "expires": "2027-01-07",
    "excludes": "Not if you have a PNC consumer checking account, closed a PNC account in the last 12 months, or got a PNC checking bonus in the last 24 months.",
    "creditPull": "soft",
    "url": "https://www.pnc.com/en/personal-banking/banking/checking/campaigns/checking-offer-for-PNC-customers.html",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Offer varies by market; PNC only operates in some states. creditPull from Doctor of Credit.",
    "tiers": [
      {
        "bonus": 100,
        "requirement": "Virtual Wallet: $500 in direct deposits in 60 days",
        "need": 500
      },
      {
        "bonus": 400,
        "requirement": "Virtual Wallet with Performance Select: $5,000 in direct deposits in 60 days",
        "need": 5000
      }
    ],
    "newMoney": null,
    "holdDays": null
  },
  {
    "id": "sofi-checking-savings-400",
    "country": "US",
    "kind": "checking",
    "institution": "SoFi",
    "product": "SoFi Checking and Savings",
    "bonus": 400,
    "requirement": "Open SoFi Checking and Savings and receive eligible direct deposits totaling the tier amount within 25 days of the first direct deposit.",
    "directDeposit": 5000,
    "depositWithinDays": 25,
    "switch": false,
    "monthlyFee": 0,
    "expires": "2027-12-31",
    "excludes": "Not if you already set up direct deposit with SoFi. One bonus per member.",
    "creditPull": "soft",
    "url": "https://www.sofi.com/banking/",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "First eligible direct deposit must arrive by 2027-12-31. Doctor of Credit lists a higher total via a cashback portal; not included. creditPull from Doctor of Credit.",
    "tiers": [
      {
        "bonus": 50,
        "requirement": "$1,000-$4,999.99 in direct deposits within 25 days of the first",
        "need": 1000
      },
      {
        "bonus": 400,
        "requirement": "$5,000+ in direct deposits within 25 days of the first",
        "need": 5000
      }
    ],
    "newMoney": null,
    "holdDays": null
  },
  {
    "id": "schwab-investor-checking-1000",
    "country": "US",
    "kind": "checking",
    "institution": "Charles Schwab",
    "product": "Schwab Bank Investor Checking (with Schwab One brokerage)",
    "bonus": 1000,
    "requirement": "Open Investor Checking linked to a Schwab One brokerage account, deposit new-to-Schwab money by 2026-11-10 and keep it there every day through 2026-12-25.",
    "newMoney": 100000,
    "holdDays": 45,
    "switch": false,
    "expires": "2026-11-10",
    "excludes": "Not if you already have Schwab Investor Checking. Money already at Schwab does not count. One bonus per client.",
    "creditPull": "soft",
    "url": "https://www.schwab.com/checking/investor-checking-offer",
    "checked": "2026-10-29",
    "verified": "tracker",
    "notes": "Schwab's page returned an access error. depositWithinDays null: deadline is a fixed date (2026-11-10), not a day count.",
    "tiers": [
      {
        "bonus": 250,
        "requirement": "$25,000-$49,999 new money",
        "need": 25000
      },
      {
        "bonus": 500,
        "requirement": "$50,000-$99,999 new money",
        "need": 50000
      },
      {
        "bonus": 1000,
        "requirement": "$100,000+ new money",
        "need": 100000
      }
    ],
    "monthlyFee": null,
    "directDeposit": null,
    "depositWithinDays": null
  },
  {
    "id": "capital-one-360-performance-savings-1500",
    "country": "US",
    "kind": "savings",
    "institution": "Capital One",
    "product": "360 Performance Savings",
    "bonus": 1500,
    "requirement": "Open 360 Performance Savings with promo code BONUS1500, deposit new external money within 15 days, and keep it there for 90 days.",
    "depositWithinDays": 15,
    "newMoney": 100000,
    "holdDays": 90,
    "switch": false,
    "monthlyFee": 0,
    "excludes": "Not if you had a 360 Performance Savings, 360 Savings, 360 Money Market, Savings Now or Confidence Savings account on or after 2024-01-01. Transfers from other Capital One accounts do not count.",
    "creditPull": "soft",
    "url": "https://www.capitalone.com/bank/bonus1500/",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "No end date on the page. creditPull from Doctor of Credit.",
    "tiers": [
      {
        "bonus": 300,
        "requirement": "$20,000-$49,999.99 new money",
        "need": 20000
      },
      {
        "bonus": 750,
        "requirement": "$50,000-$99,999.99 new money",
        "need": 50000
      },
      {
        "bonus": 1500,
        "requirement": "$100,000+ new money",
        "need": 100000
      }
    ],
    "directDeposit": null,
    "expires": null
  },
  {
    "id": "bask-bank-300",
    "country": "US",
    "kind": "savings",
    "institution": "Bask Bank",
    "product": "Interest Savings + Interest Checking",
    "bonus": 300,
    "requirement": "Open both accounts. Each statement period: $10,000+ average savings balance, $100+ daily checking balance and $2,500+ automated deposits into checking by the 25th. Pays $50 per qualifying period for up to 6 periods, plus a 0.40% APY boost.",
    "directDeposit": 2500,
    "depositWithinDays": 30,
    "newMoney": 10000,
    "switch": false,
    "monthlyFee": 0,
    "expires": "2026-12-31",
    "excludes": "Not if you or a joint owner had or closed a Bask savings or checking account in the 12 months before 2026-10-01.",
    "creditPull": "soft",
    "url": "https://baskbank.com/more-ways",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "directDeposit is per month (automated ACH deposits; recurring external transfers count), not a total. creditPull and chexSystems from Doctor of Credit.",
    "holdDays": null
  },
  {
    "id": "etrade-max-rate-checking-400",
    "country": "US",
    "kind": "checking",
    "institution": "E*TRADE (Morgan Stanley)",
    "product": "Max-Rate Checking",
    "bonus": 400,
    "requirement": "Open Max-Rate Checking online with promo code MAXRATE26 and receive at least two direct deposits of $1,500+ each within 90 days of opening.",
    "directDeposit": 3000,
    "depositWithinDays": 90,
    "switch": false,
    "monthlyFee": 0,
    "expires": "2027-01-10",
    "excludes": "Not if you had an E*TRADE Checking or Max-Rate Checking account in the last 12 months. Joint accounts: only the primary holder gets the bonus.",
    "creditPull": null,
    "url": "https://us.etrade.com/promo/checking-offer",
    "checked": "2026-10-29",
    "verified": "tracker",
    "notes": "E*TRADE's page timed out. Terms from Doctor of Credit (2026-10-20). Code must come from an authorized affiliate partner.",
    "newMoney": null,
    "holdDays": null
  },
  {
    "id": "etrade-premium-savings-800",
    "country": "US",
    "kind": "savings",
    "institution": "E*TRADE (Morgan Stanley)",
    "product": "Premium Savings",
    "bonus": 800,
    "requirement": "Open Premium Savings with promo code SAVE800, fund within 30 days and keep the balance for 45 more days.",
    "depositWithinDays": 30,
    "newMoney": 100000,
    "holdDays": 45,
    "switch": false,
    "expires": "2027-01-10",
    "excludes": "Brokerage, IRA and checking accounts do not qualify.",
    "url": "https://us.etrade.com/promo/savings",
    "checked": "2026-10-29",
    "verified": "tracker",
    "notes": "E*TRADE's page timed out. Tiers, funding and hold from a third-party blog plus search snippets of etrade.com; check before relying on them.",
    "tiers": [
      {
        "bonus": 400,
        "requirement": "$20,000-$99,999 new money",
        "need": 20000
      },
      {
        "bonus": 800,
        "requirement": "$100,000+ new money",
        "need": 100000
      }
    ],
    "monthlyFee": null,
    "directDeposit": null
  },
  {
    "id": "jpmorgan-self-directed-1000",
    "country": "US",
    "kind": "brokerage",
    "institution": "J.P. Morgan (Chase)",
    "product": "J.P. Morgan Self-Directed Investing",
    "bonus": 1000,
    "requirement": "Open a Self-Directed Investing account by 2027-01-21, fund with new money within 45 days and keep it for 90 days from enrollment.",
    "depositWithinDays": 45,
    "newMoney": 250000,
    "holdDays": 90,
    "switch": false,
    "expires": "2027-01-21",
    "excludes": "Assets from JPMorganChase or affiliates do not count. One bonus per customer per year.",
    "url": "https://www.chase.com/personal/investments/offers/ads",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Market losses do not count against the hold.",
    "tiers": [
      {
        "bonus": 50,
        "requirement": "$5,000-$24,999 new money",
        "need": 5000
      },
      {
        "bonus": 150,
        "requirement": "$25,000-$99,999 new money",
        "need": 25000
      },
      {
        "bonus": 325,
        "requirement": "$100,000-$249,999 new money",
        "need": 100000
      },
      {
        "bonus": 1000,
        "requirement": "$250,000+ new money",
        "need": 250000
      }
    ],
    "monthlyFee": null,
    "directDeposit": null
  },
  {
    "id": "merrill-edge-600",
    "country": "US",
    "kind": "brokerage",
    "institution": "Merrill (Bank of America)",
    "product": "Merrill Cash Management Account or IRA",
    "bonus": 600,
    "requirement": "Open a new CMA or IRA with offer code 600ME, fund with qualifying net new assets within 45 days and keep them for 90 days.",
    "depositWithinDays": 45,
    "newMoney": 200000,
    "holdDays": 90,
    "switch": false,
    "excludes": "Assets from other Merrill, Bank of America Private Bank or Merrill-administered 401(k) accounts do not count. One CMA and one IRA bonus per person.",
    "url": "https://www.merrilledge.com/offers/600",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "No end date on the page.",
    "tiers": [
      {
        "bonus": 100,
        "requirement": "$20,000-$49,999",
        "need": 20000
      },
      {
        "bonus": 150,
        "requirement": "$50,000-$99,999",
        "need": 50000
      },
      {
        "bonus": 250,
        "requirement": "$100,000-$199,999",
        "need": 100000
      },
      {
        "bonus": 600,
        "requirement": "$200,000+",
        "need": 200000
      }
    ],
    "monthlyFee": null,
    "directDeposit": null,
    "expires": null
  },
  {
    "id": "tastytrade-sweetbonus-2000",
    "country": "US",
    "kind": "brokerage",
    "institution": "tastytrade",
    "product": "Individual Cash / Margin / Portfolio Margin account",
    "bonus": 2000,
    "requirement": "Open with promo code SWEETBONUS, make the first deposit by 2026-11-30, settle deposits within 30 days of the first, and keep them for 12 months.",
    "depositWithinDays": 30,
    "newMoney": 100000,
    "holdDays": 365,
    "switch": false,
    "expires": "2026-11-30",
    "excludes": "Not if you have a tastytrade account funded before 2026-10-01. IRAs and entity accounts excluded.",
    "url": "https://tastytrade.com/sweet-bonus/",
    "checked": "2026-10-29",
    "verified": "institution",
    "tiers": [
      {
        "bonus": 50,
        "requirement": "$2,500-$4,999 net deposits",
        "need": 2500
      },
      {
        "bonus": 100,
        "requirement": "$5,000-$24,999",
        "need": 5000
      },
      {
        "bonus": 500,
        "requirement": "$25,000-$99,999",
        "need": 25000
      },
      {
        "bonus": 2000,
        "requirement": "$100,000+",
        "need": 100000
      }
    ],
    "monthlyFee": null,
    "directDeposit": null
  },
  {
    "id": "etrade-brokerage-1500",
    "country": "US",
    "kind": "brokerage",
    "institution": "E*TRADE (Morgan Stanley)",
    "product": "E*TRADE brokerage account",
    "bonus": 1500,
    "requirement": "Open a new non-retirement brokerage account with code OFFER26 by 2026-10-31 and deposit new funds or securities within 60 days.",
    "depositWithinDays": 60,
    "newMoney": 500000,
    "switch": false,
    "expires": "2026-10-31",
    "excludes": "Not if you have an existing E*TRADE account. Do not open other E*TRADE accounts for 60 days after enrolling.",
    "url": "https://us.etrade.com/promo/brokerage",
    "checked": "2026-10-29",
    "verified": "tracker",
    "notes": "E*TRADE's page timed out. Tier table from Motley Fool (Sept 2026); eligibility and dates from search snippets of etrade.com. 12-month hold per Doctor of Credit (update 2026-03-01). Tiers above $1M (up to $6,000) not included. Expires in 2 days.",
    "tiers": [
      {
        "bonus": 50,
        "requirement": "$1,000-$4,999",
        "need": 1000
      },
      {
        "bonus": 150,
        "requirement": "$5,000-$19,999",
        "need": 5000
      },
      {
        "bonus": 300,
        "requirement": "$20,000-$99,999",
        "need": 20000
      },
      {
        "bonus": 600,
        "requirement": "$100,000-$199,999",
        "need": 100000
      },
      {
        "bonus": 1000,
        "requirement": "$200,000-$499,999",
        "need": 200000
      },
      {
        "bonus": 1500,
        "requirement": "$500,000-$999,999",
        "need": 500000
      }
    ],
    "monthlyFee": null,
    "directDeposit": null,
    "holdDays": 365
  },
  {
    "id": "moomoo-welcome-1000",
    "country": "US",
    "kind": "brokerage",
    "institution": "moomoo",
    "product": "moomoo brokerage account",
    "bonus": 1000,
    "requirement": "Open an account and make a net deposit (ACH, wire or instant; not ACATS) that settles by 2026-12-31, then hold the average balance for the tier's period. Paid in NVDA fractional shares, not cash.",
    "newMoney": 100000,
    "holdDays": 180,
    "switch": false,
    "expires": "2026-12-31",
    "excludes": "Not if you made a deposit or ACAT transfer to a moomoo brokerage account before 2026-01-01. One reward per person and device.",
    "creditPull": "soft",
    "url": "https://www.moomoo.com/us/support/topic4_410",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Reward is stock (NVDA), plus $100 trading coupons for a $100 deposit. Terms page (promotion 2026-01-01 to 2026-12-31) has internal inconsistencies on the hold for the top tiers.",
    "tiers": [
      {
        "bonus": 30,
        "requirement": "$500 net deposit, held 60 days",
        "need": 500
      },
      {
        "bonus": 100,
        "requirement": "$2,000, held 60 days",
        "need": 2000
      },
      {
        "bonus": 200,
        "requirement": "$10,000, held 60 days",
        "need": 10000
      },
      {
        "bonus": 400,
        "requirement": "$50,000 ($10,000 for 60 days and $50,000 for 120 days)",
        "need": 50000
      },
      {
        "bonus": 1000,
        "requirement": "$100,000 ($10,000/60d, $50,000/120d, $100,000/180d)",
        "need": 100000
      }
    ],
    "monthlyFee": null,
    "directDeposit": null,
    "depositWithinDays": null
  },
  {
    "id": "barclays-bank-account-switch-300",
    "country": "GB",
    "kind": "checking",
    "institution": "Barclays",
    "product": "Barclays Bank Account",
    "bonus": 300,
    "requirement": "Open a sole account in the app, complete a full CASS switch with 3+ active Direct Debits and pay in £2,000+ salary within 30 days. Extra £30 a month for 5 months with £2,000 salary and 10 card purchases each month.",
    "directDeposit": 2000,
    "depositWithinDays": 30,
    "switch": true,
    "debitTxns": 10,
    "monthlyFee": 0,
    "excludes": "Not if you had any open Barclays current account on or before 2026-10-01, or previously got a switch bonus. No joint accounts.",
    "url": "https://www.barclays.co.uk/current-accounts/switch-offer/",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "debitTxns is per month, for the monthly £30 rewards only. Offer runs from 2026-10-01 until withdrawn.",
    "newMoney": null,
    "holdDays": null,
    "expires": null
  },
  {
    "id": "santander-everyday-switch-240",
    "country": "GB",
    "kind": "checking",
    "institution": "Santander",
    "product": "Everyday Current Account",
    "bonus": 240,
    "requirement": "Request a CASS switch on or after 2026-10-27. Within 60 days: complete the switch, pay in £1,500, have 2+ household Direct Debits, and put £200+ in a Santander Regular Saver.",
    "depositWithinDays": 60,
    "newMoney": 1500,
    "switch": true,
    "monthlyFee": 0,
    "excludes": "Not if you held a Santander current account on 2026-01-01, previously got a Santander switch incentive, or are switching from Santander, cahoot or Cater Allen.",
    "url": "https://www.santander.co.uk/personal/current-accounts/everyday-current-account",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Paid 90 days after the switch request. Both accounts and Direct Debits must still be active then.",
    "directDeposit": null,
    "holdDays": null,
    "expires": null
  },
  {
    "id": "hsbc-bank-account-switch-220",
    "country": "GB",
    "kind": "checking",
    "institution": "HSBC UK",
    "product": "HSBC Bank Account",
    "bonus": 220,
    "requirement": "Open in the HSBC app. Within 60 days: full CASS switch with 2+ Direct Debits, pay in £2,000 and spend £500 on the debit card.",
    "depositWithinDays": 60,
    "newMoney": 2000,
    "switch": true,
    "excludes": "Not if you are an HSBC UK or first direct customer, or held either's current account on or after 2023-01-01. Basic Bank Account excluded.",
    "url": "https://www.hsbc.co.uk/current-accounts/switching-to-hsbc/",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Requires £500 debit card spend (amount, not count). Monthly fee not stated on the page. Exclusion date (2023-01-01) from HSBC's T&Cs via search snippet.",
    "monthlyFee": null,
    "directDeposit": null,
    "holdDays": null,
    "expires": null
  },
  {
    "id": "first-direct-1st-account-switch-210",
    "country": "GB",
    "kind": "checking",
    "institution": "first direct",
    "product": "1st Account",
    "bonus": 210,
    "requirement": "Within 45 days of opening: CASS switch with 2+ Direct Debits or standing orders, pay in £1,000, make 5+ debit card payments and log in to digital banking. £175 plus £35 boost for accounts opened 2026-09-14 to 2026-12-02.",
    "depositWithinDays": 45,
    "newMoney": 1000,
    "switch": true,
    "debitTxns": 5,
    "expires": "2026-12-02",
    "excludes": "Not if you ever held a first direct product, or opened an HSBC current account on or after 2018-01-01.",
    "url": "https://www.firstdirect.com/banking/switching-bank-accounts/",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "expires is the end of the £35 boost; the base £175 has no end date. Monthly fee not stated on the page.",
    "monthlyFee": null,
    "directDeposit": null,
    "holdDays": null
  },
  {
    "id": "lloyds-club-switch-200",
    "country": "GB",
    "kind": "checking",
    "institution": "Lloyds Bank",
    "product": "Club Lloyds (also Silver, Platinum, Lloyds Premier)",
    "bonus": 200,
    "requirement": "Open an eligible account between 2026-09-17 and 2026-12-09 and start a CASS full switch from another bank with 3+ active Direct Debits by 2026-12-09.",
    "switch": true,
    "monthlyFee": 5,
    "feeWaiver": "Pay in £2,000+ a month.",
    "expires": "2026-12-09",
    "excludes": "Not if you got a Lloyds, Halifax or Bank of Scotland switch incentive since 2023-01-01, or are switching from Halifax or Bank of Scotland.",
    "url": "https://www.lloydsbank.com/current-accounts/switch.html",
    "checked": "2026-10-29",
    "verified": "tracker",
    "notes": "Lloyds site returned error pages. Open window from a search snippet of lloydsbank.com; rest from MoneySavingExpert (updated 2026-10-27). Paid within 14 working days of the switch starting.",
    "directDeposit": null,
    "depositWithinDays": null,
    "newMoney": null,
    "holdDays": null
  },
  {
    "id": "natwest-switch-200",
    "country": "GB",
    "kind": "checking",
    "institution": "NatWest",
    "product": "Select or Reward account",
    "bonus": 200,
    "requirement": "Open Select or Reward and complete a full CASS switch. Within 60 days of switching, pay in £1,250 (kept 24 hours) and log in to the mobile app.",
    "depositWithinDays": 60,
    "newMoney": 1250,
    "switch": true,
    "monthlyFee": 0,
    "feeWaiver": "Select is free. Reward is £2 a month.",
    "excludes": "Not if you held a NatWest current account on 2026-05-06, previously got a NatWest Group switch incentive, or are switching from RBS or Ulster Bank.",
    "url": "https://www.natwest.com/current-accounts/switch-your-banking-to-natwest.html",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "MSE says 2+ Direct Debits of £2+ must be kept; not stated on NatWest's page.",
    "directDeposit": null,
    "holdDays": null,
    "expires": null
  },
  {
    "id": "nationwide-flex-switch-175",
    "country": "GB",
    "kind": "checking",
    "institution": "Nationwide Building Society",
    "product": "FlexDirect, FlexAccount or FlexPlus",
    "bonus": 175,
    "requirement": "Full CASS switch with 2+ Direct Debits, completed within 28 days. Within 31 days of opening, pay in £1,000 and make 1 debit card payment.",
    "depositWithinDays": 31,
    "newMoney": 1000,
    "switch": true,
    "debitTxns": 1,
    "monthlyFee": 0,
    "feeWaiver": "FlexDirect and FlexAccount free; FlexPlus £18 a month.",
    "excludes": "Not if switching from Nationwide or Virgin Money. Max once on a sole and once on a joint account. MSE: not if you got a Nationwide switch bonus since 2021.",
    "url": "https://www.nationwide.co.uk/current-accounts/switch/",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "The £1,000 cannot come from other Nationwide accounts.",
    "directDeposit": null,
    "holdDays": null,
    "expires": null
  },
  {
    "id": "ig-free-shares-1000",
    "country": "GB",
    "kind": "brokerage",
    "institution": "IG",
    "product": "Share dealing GIA or ISA",
    "bonus": 50,
    "requirement": "Open a GIA or ISA with code SHARES1K by 2026-10-31, invest £500+ by 2026-10-31 and keep an average £500+ invested until 2027-01-31. Reward is random, £50-£1,000 in shares.",
    "newMoney": 500,
    "holdDays": 92,
    "switch": false,
    "expires": "2026-10-31",
    "excludes": "Not if you have ever held any IG account. Transfers in, IPO trades and cash deposits do not count toward the £500.",
    "url": "https://www.ig.com/uk/invest-campaign/free-shares",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Counted at £50, the minimum of the random draw (up to £1,000). Credited by 2027-02-28. Expires in 2 days.",
    "monthlyFee": null,
    "directDeposit": null,
    "depositWithinDays": null
  },
  {
    "id": "ii-isa-150-trading-credit",
    "country": "GB",
    "kind": "brokerage",
    "institution": "interactive investor",
    "product": "ii Stocks and Shares ISA",
    "bonus": 150,
    "requirement": "Open an ii ISA as a new customer by 2026-10-31. Get £150 towards trading fees (not cash).",
    "switch": false,
    "expires": "2026-10-31",
    "excludes": "New customers only.",
    "url": "https://www.ii.co.uk/ii-accounts/isa/offers-and-cashback",
    "checked": "2026-10-29",
    "verified": "institution",
    "notes": "Credit for trading fees, not cash. ii charges a monthly account fee; amount not on the offer page, so monthlyFee left null. Expires in 2 days.",
    "cash": false,
    "monthlyFee": null,
    "directDeposit": null,
    "depositWithinDays": null,
    "newMoney": null,
    "holdDays": null
  }
];
