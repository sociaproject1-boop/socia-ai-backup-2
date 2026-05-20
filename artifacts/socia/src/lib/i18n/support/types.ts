export interface SupportCopy {
  title:              string;   // "Support Socia"
  subtitle:           string;   // short tagline shown under the title
  sectionAmount:      string;
  sectionMethod:      string;
  customAmountLabel:  string;
  customAmountHint:   string;
  methodGcash:        string;
  methodMaya:         string;
  methodCard:         string;
  cta:                string;   // "Continue Secure Payment"
  back:               string;
  securing:           string;
  trustLine:          string;   // "Powered by PayMongo · Encrypted checkout"
  recentSupporters:   string;
  noRecentSupporters: string;
  minAmountError:     string;
  trustPoints:        string[]; // bullets shown under the form
  thanksTitle:        string;   // success page
  thanksBody:         string;
  thanksCta:          string;
  // Stats card
  raisedLabel:        string;
  goalLabel:          string;
  supportersLabel:    string;
  remainingSuffix:    string;
  fundedSuffix:       string;
  triggerCta:         string;   // main "Support Socia" button on funding card
}
