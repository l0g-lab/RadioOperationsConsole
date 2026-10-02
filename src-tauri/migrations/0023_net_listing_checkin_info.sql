-- What a station should know before checking in to a listed net
-- ("check-ins start at 19:05, call sign and name, mobiles first").
ALTER TABLE net_listings ADD COLUMN checkin_info TEXT;
